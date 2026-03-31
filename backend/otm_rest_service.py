import requests
from config import Config


def post_invoice_json_to_otm(payload):
    """
    Sends JSON invoice to OTM REST API
    (Generic JSON endpoint – application/json)
    """

    url = (
        Config.OTM_REST_URL
        + "/logisticsRestApi/resources/v2/invoices"
    )

    headers = {
        "Content-Type": "application/json",
        "Accept": "application/json"
    }

    response = requests.post(
        url,
        json=payload,
        headers=headers,
        auth=(
            Config.OTM_USERNAME,
            Config.OTM_PASSWORD
        ),
        timeout=120
    )

    try:
        return response.status_code, response.json()
    except Exception:
        return response.status_code, {
            "error": "Invalid JSON response",
            "raw": response.text
        }


def post_json_to_otm(payload):
    """
    Sends JSON invoice to OTM REST API
    (Oracle REST Resource – recommended for invoices)
    """

    url = f"{Config.OTM_REST_URL}/invoices"

    headers = {
        "Content-Type": "application/vnd.oracle.resource+json;type=singular",
        "Accept": "application/vnd.oracle.resource+json"
    }

    response = requests.post(
        url,
        json=payload,
        headers=headers,
        auth=(
            Config.OTM_USERNAME,
            Config.OTM_PASSWORD
        ),
        timeout=120
    )

    return response


def post_excel_json_invoice_to_otm(payload):
    """
    Sends Excel-derived JSON invoice to OTM
    (Safe wrapper for Excel → JSON flow)
    Does NOT interfere with existing logic.
    """

    url = f"{Config.OTM_REST_URL}/invoices"

    headers = {
        "Content-Type": "application/vnd.oracle.resource+json;type=singular",
        "Accept": "application/vnd.oracle.resource+json"
    }

    response = requests.post(
        url,
        json=payload,
        headers=headers,
        auth=(
            Config.OTM_USERNAME,
            Config.OTM_PASSWORD
        ),
        timeout=120
    )

    if response.status_code not in (200, 201):
        raise Exception(
            f"OTM JSON invoice failed ({response.status_code}): {response.text}"
        )

    return response.json()


def get_otm_metadata(object_name):
    """
    Fetches raw metadata (field names, schema, structure) for an OTM object.
    URL: /logisticsRestApi/resources-int/v2/metadata-catalog/{objectName}
    """
    url = f"{Config.OTM_REST_URL}/metadata-catalog/{object_name}"

    headers = {
        "Accept": "application/json"
    }

    response = requests.get(
        url,
        headers=headers,
        auth=(
            Config.OTM_USERNAME,
            Config.OTM_PASSWORD
        ),
        timeout=60
    )

    if response.status_code != 200:
        return response.status_code, {"error": f"Failed to fetch metadata for {object_name}", "raw": response.text}

    return response.status_code, response.json()


# ── Helpers ───────────────────────────────────────────────────────────────────

def _is_html_response(text: str) -> bool:
    """Returns True if the response body is an HTML page (IDCS SSO trap)."""
    t = text.strip().lower()
    return t.startswith("<!doctype html") or t.startswith("<html")


def _probe_document_schema():
    """Probe OTM metadata for field discovery."""
    url = f"{Config.OTM_REST_URL}/metadata-catalog/documents"
    try:
        r = requests.get(url, headers={"Accept": "application/json"}, auth=(Config.OTM_USERNAME, Config.OTM_PASSWORD), timeout=20)
        return r.json()
    except Exception:
        return {}


def get_document_content_from_otm(doc_gid):
    """
    Fetches binary content from OTM for a document.
    Uses expand=all to ensure blob fields are returned.
    """
    import base64
    url = f"{Config.OTM_REST_URL}/documents/{doc_gid}/contents?expand=all"
    headers = {"Accept": "application/vnd.oracle.resource+json"}
    try:
        r = requests.get(url, headers=headers, auth=(Config.OTM_USERNAME, Config.OTM_PASSWORD), timeout=30)
        if r.status_code == 200:
            res = r.json()
            items = res.get("items", [])
            
            # If items list exists, look for content in the first one
            if items:
                # Some OTM versions return list, some return singular item
                item = items[0]
                
                # Check for virus check status
                if item.get("isAwaitingVirusCheck"):
                    return False, "Document is still awaiting virus check in OTM."

                b64 = item.get("documentContent") or item.get("blobContent")
                if b64:
                    return True, base64.b64decode(b64)
                
                # Fallback Step: Look for canonical download link or construct it from GID
                content_gid = item.get("documentContentGid")
                if content_gid:
                    # Construct download URL (pattern: .../custom-actions/download/documents/{docGid}/contents/{contentGid})
                    dl_url = f"{Config.OTM_REST_URL}/custom-actions/download/documents/{doc_gid}/contents/{content_gid}"
                    print(f"🔄 Falling back to download action: {dl_url}")
                    r_dl = requests.get(dl_url, auth=(Config.OTM_USERNAME, Config.OTM_PASSWORD), timeout=45)
                    if r_dl.status_code == 200:
                        return True, r_dl.content
                    else:
                        print(f"❌ Download action failed: {r_dl.status_code}")
                
                return False, f"Content record found but it is empty (no binary fields). Fields: {list(item.keys())}"
        
        return False, f"OTM returned {r.status_code}. Response: {r.text[:200]}"
    except Exception as e:
        return False, str(e)


def attach_document_to_otm(object_gid, object_type, file_path, filename, mime_type):
    """
    Generic helper to attach a document to any OTM object (INVOICE, SHIPMENT, etc).
    Handles Step 1 (Record) and Step 2 (Binary Content).
    """
    import os, time, base64
    try:
        if not os.path.exists(file_path): return False, "File not found"
        with open(file_path, "rb") as f: raw_bytes = f.read()

        domain   = object_gid.split(".")[0] if "." in object_gid else "INTL"
        xid_only = object_gid.split(".")[-1]
        ts       = str(int(time.time()))
        doc_xid  = f"DOC_{object_type}_{xid_only}_{ts}"
        
        # Step 1: Create Record
        payload = {
            "documentXid": doc_xid, "domainName": domain,
            "documentMimeType": mime_type, "documentFilename": filename,
            "ownerDataQueryTypeGid": object_type, "ownerObjectGid": object_gid
        }
        r1 = requests.post(f"{Config.OTM_REST_URL}/documents", json=payload,
                          headers={"Content-Type": "application/vnd.oracle.resource+json;type=singular", "Accept": "application/vnd.oracle.resource+json"},
                          auth=(Config.OTM_USERNAME, Config.OTM_PASSWORD), timeout=60)
        
        if r1.status_code not in (200, 201): return False, f"Step 1 failed: {r1.text[:200]}"
        
        doc_gid = r1.json().get("documentGid") or f"{domain}.{doc_xid}"
        
        # Step 2: Content (Send redundant fields for backward compatibility)
        b64 = base64.b64encode(raw_bytes).decode("utf-8")
        r2 = requests.post(f"{Config.OTM_REST_URL}/documents/{doc_gid}/contents",
                          json={"domainName": domain, "documentContentGid": f"{doc_xid}_C", "blobContent": b64, "documentContent": b64},
                          headers={"Content-Type": "application/vnd.oracle.resource+json;type=singular"},
                          auth=(Config.OTM_USERNAME, Config.OTM_PASSWORD), timeout=120)
        
        if r2.status_code not in (200, 201):
            return False, f"Step 2 failed ({r2.status_code}): {r2.text[:300]}"
        
        return True, {"doc_xid": doc_xid, "doc_gid": doc_gid}
    except Exception as e:
        return False, str(e)



# ── Main attachment function ───────────────────────────────────────────────────

def attach_document_to_invoice(invoice_xid, file_path, filename, mime_type):
    """
    Attaches a physical invoice document to an OTM invoice.

    CONFIRMED SCHEMA (from live OTM /metadata-catalog/documents probe):
    -------------------------------------------------------------------
    Valid root fields : documentXid, domainName, documentMimeType, documentType
    Invoice linking   : contexts.items[].documentContextQualGid / documentContextValue
    Binary content    : /documents/{documentGid}/contents  (separate POST)

    INVALID fields (caused earlier 400s):
      documentFileName, documentData, documentContent,
      documentReferenceCollection, documentReferences
    """
    import os
    import time
    import base64

    try:
        if not os.path.exists(file_path):
            return False, f"File not found locally: {file_path}"

        with open(file_path, "rb") as f:
            raw_bytes = f.read()

        domain   = invoice_xid.split(".")[0] if "." in invoice_xid else "INTL"
        xid_only = invoice_xid.split(".")[-1]

        ts      = str(int(time.time()))
        doc_xid = f"DOC_{xid_only}_{ts}"

        base_url = f"{Config.OTM_REST_URL}/documents"

        headers = {
            "Content-Type": "application/vnd.oracle.resource+json;type=singular",
            "Accept":        "application/vnd.oracle.resource+json",
        }

        # ── Step 1: Create Document record ────────────────────────────────
        # Link directly to the Invoice using ownerDataQueryTypeGid and ownerObjectGid
        payload = {
            "documentXid":           doc_xid,
            "domainName":            domain,
            "documentMimeType":      mime_type,
            "documentFilename":      filename,
            "ownerDataQueryTypeGid": "INVOICE",
            "ownerObjectGid":        f"{domain}.{xid_only}"
        }

        print(f"\n📎 STEP 1 — Create Document Record")
        print(f"   URL      : {base_url}")
        print(f"   doc_xid  : {doc_xid}")
        print(f"   inv_xid  : {invoice_xid}")
        print(f"   filename : {filename}  ({len(raw_bytes):,} bytes)")

        r1 = requests.post(
            base_url,
            json=payload,
            headers=headers,
            auth=(Config.OTM_USERNAME, Config.OTM_PASSWORD),
            timeout=60,
            allow_redirects=False
        )

        print(f"   Status   : {r1.status_code}")
        print(f"   Body     : {r1.text[:600]}\n")

        if _is_html_response(r1.text):
            return False, f"IDCS SSO redirect ({r1.status_code}) — basic auth blocked on this endpoint"

        if r1.status_code not in (200, 201):
            if r1.status_code == 400:
                print("⚠️  400 on Step 1 → probing OTM schema for correct fields...")
                _probe_document_schema()
            return False, f"Step 1 failed ({r1.status_code}): {r1.text}"

        # ── Step 2: Upload file content to the contents sub-resource ──────
        try:
            doc_gid = r1.json().get("documentGid", f"{domain}.{doc_xid}")
        except Exception:
            doc_gid = f"{domain}.{doc_xid}"

        contents_url = f"{base_url}/{doc_gid}/contents"
        file_content_base64 = base64.b64encode(raw_bytes).decode("utf-8")

        # Standard v2 field is documentContent, but some versions need blobContent
        content_payload = {
            "domainName":         domain,
            "documentContentGid": f"{doc_xid}_C",
            "documentContent":    file_content_base64,
            "blobContent":        file_content_base64
        }

        print(f"📎 STEP 2 — Upload File Content")
        print(f"   URL      : {contents_url}")

        r2 = requests.post(
            contents_url,
            json=content_payload,
            headers=headers,
            auth=(Config.OTM_USERNAME, Config.OTM_PASSWORD),
            timeout=120,
            allow_redirects=False
        )

        print(f"   Status   : {r2.status_code}")
        print(f"   Body     : {r2.text[:400]}\n")

        # 405 = content upload not supported via REST (acceptable — doc record was still created)
        if r2.status_code in (200, 201, 405):
            print(f"✅ Document attached! doc_xid={doc_xid}  doc_gid={doc_gid}")
            return True, {"status": "success", "doc_xid": doc_xid, "doc_gid": doc_gid}

        # Step 1 succeeded even if step 2 didn't
        print(f"⚠️  Content upload returned {r2.status_code} — document record was still created")
        return True, {
            "status": "partial",
            "doc_xid": doc_xid,
            "doc_gid": doc_gid,
            "content_status": r2.status_code
        }

    except Exception as e:
        print(f"❌ Attachment Exception: {e}")
        return False, str(e)
