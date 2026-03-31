from flask import Blueprint, request, jsonify, send_file
import os
import json
import uuid
import time
import requests
import mimetypes
import shutil

from .config import Config
from .ocr_processor import extract_text_from_image as _text_from_image, extract_text_from_pdf
from .otm_rest_service import (
    get_otm_metadata, attach_document_to_otm, get_document_content_from_otm
)

tracking_bp = Blueprint("tracking", __name__)

OTM_REST   = Config.OTM_REST_URL          # resources-int/v2
AUTH       = (Config.OTM_USERNAME, Config.OTM_PASSWORD)
JSON_HDR   = {
    "Content-Type": "application/vnd.oracle.resource+json;type=singular",
    "Accept":       "application/vnd.oracle.resource+json",
    "Prefer":       "return=representation",
}

# ─── helpers ────────────────────────────────────────────────────────────────

def _otm_get(path, params=None):
    r = requests.get(
        f"{OTM_REST}/{path}",
        params=params,
        headers={"Accept": "application/vnd.oracle.resource+json"},
        auth=AUTH, timeout=30
    )
    return r.status_code, r.json() if r.text else {}


def _otm_post(path, payload):
    r = requests.post(
        f"{OTM_REST}/{path}",
        json=payload,
        headers=JSON_HDR,
        auth=AUTH, timeout=60
    )
    try:
        body = r.json()
    except Exception:
        body = {"raw": r.text}
    if r.status_code not in (200, 201):
        print(f"\n❌ OTM {path} → {r.status_code}")
        print(f"   Body: {json.dumps(body, indent=2)[:1500]}\n")
    return r.status_code, body


def _parse_pod_with_llm(raw_text: str) -> dict:
    """Use Gemini to extract tracking event fields from raw OCR text."""
    import google.generativeai as genai
    from dotenv import load_dotenv
    from pydantic import BaseModel, Field
    load_dotenv()
    genai.configure(api_key=os.environ.get("GOOGLE_API_KEY"))

    class PodSchema(BaseModel):
        shipmentGid: str = Field(description="Shipment ID, reference number, or INTL number e.g. INTL.111000")
        statusCodeGid: str = Field(description="Delivery status code: D1 for Delivered, X1 for In Transit, etc.")
        statusReasonCodeGid: str = Field(description="Reason code, e.g. NS for Normal, DEL for Delivery")
        responsiblePartyGid: str = Field(description="Responsible party: CARRIER, SHIPPER, or company name")
        eventDate: str = Field(description="ISO-8601 datetime of the delivery/event e.g. 2026-03-27T09:49:00+05:30")
        timeZoneGid: str = Field(description="IANA time zone identifier e.g. Asia/Kolkata, US/Pacific")
        remarks: str = Field(description="Any extra notes, remarks, or signature info found")

    model = genai.GenerativeModel("gemini-2.5-flash")
    prompt = f"""
You are an intelligent OCR parser for Oracle Transportation Management (OTM).
Extract delivery/tracking event info from this Proof-of-Delivery (POD) document.

Rules:
- shipmentGid: look for "Shipment", "Ref", "INTL", "Order" numbers.
- statusCodeGid: if delivered → "D1", in-transit → "X1", picked-up → "P1".
- If no time zone is found, default to "Asia/Kolkata".
- eventDate must be ISO-8601 with timezone offset.
- Return ONLY valid JSON.

Raw OCR text:
======================
{raw_text}
======================
"""
    result = model.generate_content(
        prompt,
        generation_config=genai.GenerationConfig(
            response_mime_type="application/json",
            response_schema=PodSchema,
            temperature=0.1
        ),
    )
    data = json.loads(result.text)
    return data


# ─── routes ─────────────────────────────────────────────────────────────────

@tracking_bp.route("/shipments", methods=["GET"])
def list_shipments():
    """Fetch a list of shipments from OTM for the dropdown."""
    limit = request.args.get("limit", 50)
    status, body = _otm_get("shipments", params={"limit": limit, "orderBy": "insertDate:desc"})
    if status == 200:
        items = body.get("items", [])
        simplified = [
            {
                "shipmentGid": s.get("shipmentGid"),
                "shipmentXid": s.get("shipmentXid"),
                "domain":      s.get("domainName", "INTL"),
            }
            for s in items if s.get("shipmentGid")
        ]
        return jsonify({"shipments": simplified})
    return jsonify({"shipments": [], "warning": f"OTM returned {status}"}), 200


@tracking_bp.route("/tracking-events", methods=["GET"])
def get_tracking_events():
    """
    Fetch tracking events for a specific shipment.
    ?shipmentGid=INTL.111000
    """
    shipment_gid = request.args.get("shipmentGid", "").strip()
    if not shipment_gid:
        return jsonify({"error": "shipmentGid is required"}), 400
    
    if "." not in shipment_gid:
        shipment_gid = f"INTL.{shipment_gid}"

    q = f'shipmentGid eq "{shipment_gid}"'
    status, body = _otm_get("trackingEvents", params={"q": q, "limit": 100, "orderBy": "eventdate:desc"})

    if status == 200:
        return jsonify({"events": body.get("items", [])})
    return jsonify({"error": f"OTM returned {status}", "detail": body}), status


@tracking_bp.route("/tracking-events/<path:event_id>", methods=["GET"])
def get_single_event(event_id):
    status, body = _otm_get(f"trackingEvents/{event_id}")
    if status == 200:
        return jsonify(body)
    return jsonify({"error": f"OTM returned {status}", "detail": body}), status


@tracking_bp.route("/pod/extract-ocr", methods=["POST"])
def extract_pod_ocr():
    """
    Accepts a PDF or image POD upload.
    Returns OCR-extracted + LLM-parsed tracking event fields.
    """
    file = request.files.get("file")
    if not file:
        return jsonify({"error": "No file uploaded"}), 400

    ext = os.path.splitext(file.filename)[-1].lower() or ".pdf"
    if ext not in (".pdf", ".jpg", ".jpeg", ".png", ".tiff", ".bmp", ".webp"):
        return jsonify({"error": "Only PDF and image files are supported"}), 400

    os.makedirs("temp_uploads", exist_ok=True)
    temp_path = os.path.join("temp_uploads", f"pod_tmp_{uuid.uuid4().hex[:8]}{ext}")
    persist_path = os.path.join("temp_uploads", f"pod_persist_{uuid.uuid4().hex[:8]}{ext}")

    file.save(temp_path)
    shutil.copy2(temp_path, persist_path)

    try:
        if ext == ".pdf":
            raw_text = extract_text_from_pdf(temp_path)
        else:
            raw_text = _text_from_image(temp_path)

        print(f"POD OCR — extracted {len(raw_text)} chars")

        try:
            parsed = _parse_pod_with_llm(raw_text)
        except Exception as llm_err:
            print(f"LLM parse error: {llm_err}")
            parsed = {
                "shipmentGid":        "",
                "statusCodeGid":      "D1",
                "statusReasonCodeGid":"NS",
                "responsiblePartyGid":"CARRIER",
                "eventDate":          "",
                "timeZoneGid":        "Asia/Kolkata",
                "remarks":            raw_text[:300],
            }

        mtype, _ = mimetypes.guess_type(persist_path)
        if not mtype:
            mtype = "application/pdf" if ext == ".pdf" else "image/jpeg"

        parsed["_raw_ocr_text"]       = raw_text
        parsed["_document_path"]      = persist_path
        parsed["_document_filename"]  = file.filename
        parsed["_document_mimetype"]  = mtype

        return jsonify({"extracted_data": parsed})

    except Exception as e:
        print(f"POD OCR error: {e}")
        return jsonify({"error": str(e)}), 500
    finally:
        if os.path.exists(temp_path):
            os.remove(temp_path)


@tracking_bp.route("/shipment-documents/<path:ship_gid>", methods=["GET"])
def get_shipment_documents(ship_gid):
    """List all documents for a shipment."""
    if "." not in ship_gid: ship_gid = f"INTL.{ship_gid}"
    params = {"q": f"ownerObjectGid eq \"{ship_gid}\""}
    status, result = _otm_get("documents", params=params)
    if status != 200:
        return jsonify({"error": f"Failed to fetch documents: {status}"}), status
    
    docs = []
    for item in result.get("items", []):
        gid = item.get("documentGid")
        if not gid:
            domain = item.get("domainName", "INTL")
            xid = item.get("documentXid")
            if xid: gid = f"{domain}.{xid}"

        docs.append({
            "docGid": gid,
            "docXid": item.get("documentXid"),
            "filename": item.get("documentFilename"),
            "mimeType": item.get("documentMimeType")
        })
    return jsonify({"documents": [d for d in docs if d['docGid']]})


@tracking_bp.route("/view-document/<path:doc_gid>", methods=["GET"])
def view_document(doc_gid):
    """Fetch content from OTM and serve as a proxy for UI viewing (supports PDF and images)."""
    if not doc_gid or doc_gid == "null":
        return jsonify({"error": "Invalid Document ID"}), 400

    print(f"📄 Fetching content for Document: {doc_gid}")
    ok, data = get_document_content_from_otm(doc_gid)
    if not ok:
        print(f"❌ View doc failed for {doc_gid}: {data}")
        return jsonify({"error": data}), 404
    
    # Simple Content-Type sniffer without deprecated imghdr
    import io
    mime = "application/octet-stream"
    
    if data.startswith(b"%PDF"):
        mime = "application/pdf"
    elif data.startswith(b"\xff\xd8\xff"):
        mime = "image/jpeg"
    elif data.startswith(b"\x89PNG\r\n\x1a\n"):
        mime = "image/png"
    elif data.startswith(b"GIF87a") or data.startswith(b"GIF89a"):
        mime = "image/gif"
    elif data.startswith(b"RIFF") and data[8:12] == b"WEBP":
        mime = "image/webp"
    elif ".jpg" in doc_gid.lower() or ".jpeg" in doc_gid.lower():
        mime = "image/jpeg"
    elif ".png" in doc_gid.lower():
        mime = "image/png"
    elif ".pdf" in doc_gid.lower():
        mime = "application/pdf"

    return send_file(
        io.BytesIO(data),
        mimetype=mime,
        download_name=f"view_{doc_gid.split('.')[-1]}"
    )


@tracking_bp.route("/tracking-events", methods=["POST"])
def create_tracking_event():
    """
    Creates a tracking event in OTM.
    Optionally attaches the POD document.
    """
    data = request.json or {}

    document_path     = data.pop("_document_path", None)
    document_filename = data.pop("_document_filename", "pod_document")
    document_mimetype = data.pop("_document_mimetype", "application/pdf")
    data.pop("_raw_ocr_text", None)

    shipment_gid        = data.get("shipmentGid", "").strip()
    status_code_gid     = data.get("statusCodeGid", "D1")
    reason_code_gid     = data.get("statusReasonCodeGid", "NS")
    resp_party_gid      = data.get("responsiblePartyGid", "CARRIER")
    event_date_val      = data.get("eventDate", "")
    timezone_gid        = data.get("timeZoneGid", "Asia/Kolkata")

    if not shipment_gid:
        return jsonify({"error": "shipmentGid is required"}), 400
    
    if "." not in shipment_gid:
        shipment_gid = f"INTL.{shipment_gid}"

    if not event_date_val:
        return jsonify({"error": "eventDate is required"}), 400

    domain = shipment_gid.split(".")[0] if "." in shipment_gid else "INTL"

    from datetime import datetime, timezone as tz
    received_now = datetime.now(tz.utc).strftime("%Y-%m-%dT%H:%M:%S+00:00")

    payload = {
        "shipmentGid":         shipment_gid,
        "statusCodeGid":       status_code_gid,
        "responsiblePartyGid": resp_party_gid,
        "domainName":          domain,
        "eventdate": {
            "value":    event_date_val,
            "timezone": timezone_gid,
        },
        "eventReceivedDate": {
            "value": received_now,
        },
    }
    if reason_code_gid:
        payload["statusReasonCodeGid"] = reason_code_gid

    print("\n========== POST /trackingEvents ==========")
    print(json.dumps(payload, indent=2))
    print("==========================================\n")

    status, body = _otm_post("trackingEvents", payload)

    if status not in (200, 201):
        return jsonify({"error": f"OTM returned {status}", "detail": body}), status

    event_gid = body.get("trackingEventGid") or body.get("trackingEventXid", "") or body.get("id", "")
    if not event_gid and "links" in body:
        for link in body["links"]:
            if link.get("rel") in ("self", "canonical"):
                href_parts = link.get("href", "").rstrip("/").split("/")
                event_gid = href_parts[-1]
                break

    response_data = {"message": "Tracking event created", "event": body, "eventGid": event_gid, "id": event_gid}

    # ── Attach POD document ────────────────────────────────────────────────
    if document_path and os.path.exists(document_path):
        from .otm_rest_service import attach_document_to_otm
        from datetime import datetime
        
        # New automated naming convention
        date_str = datetime.now().strftime("%Y%m%d")
        safe_xid = shipment_gid.split(".")[-1]
        pretty_filename = f"POD_{safe_xid}_{date_str}.pdf"
        if not document_filename.lower().endswith(".pdf"):
             pretty_filename = f"POD_{safe_xid}_{date_str}" + os.path.splitext(document_filename)[1]

        # ── Attachment 1: Shipment ──────────────────────────────────────────
        ok_ship, res_ship = attach_document_to_otm(
            object_gid=shipment_gid,
            object_type="SHIPMENT",
            file_path=document_path,
            filename=pretty_filename,
            mime_type=document_mimetype
        )
        
        # ── Attachment 2: Tracking Event ───────────────────────────────────
        ok_event, res_event = False, None
        if event_gid:
            ok_event, res_event = attach_document_to_otm(
                object_gid=event_gid if "." in event_gid else f"{domain}.{event_gid}",
                object_type="TRACKING_EVENT",
                file_path=document_path,
                filename=pretty_filename,
                mime_type=document_mimetype
            )

        if ok_ship:
            response_data["documentAttached"] = True
            response_data["docGid"] = res_ship["doc_gid"]
            response_data["docXid"] = res_ship["doc_xid"]
            response_data["prettyFilename"] = pretty_filename
        
        if ok_event:
            response_data["eventDocumentAttached"] = True
            response_data["eventDocGid"] = res_event["doc_gid"]
        else:
            print(f"⚠️ Event attachment failed: {res_event}")
            response_data["eventDocumentError"] = str(res_event)

        if not ok_ship and not ok_event:
            response_data["documentAttached"] = False
            response_data["documentError"] = res_ship
        
        try: os.remove(document_path)
        except: pass

    return jsonify(response_data), 201
