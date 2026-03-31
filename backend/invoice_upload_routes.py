from flask import Blueprint, request, jsonify
import pandas as pd
import os
import json
import base64
import mimetypes
import uuid

from .json_builder import build_invoice_json_from_dataframe
from .xml_builder import build_invoice_xml

from .otm_service import post_to_otm, get_invoice_definitions
from .otm_rest_service import post_excel_json_invoice_to_otm, attach_document_to_invoice

from .models import Invoice
from .database import db
from .fuzzy_matcher import find_column_fuzzy
from .ocr_processor import extract_text_from_image, extract_text_from_pdf, parse_invoice_text

invoice_upload_routes = Blueprint("invoice_upload_routes", __name__)

TEMPLATES_FILE = "invoice_templates.json"


def get_template_full(template_id):
    if not template_id or not os.path.exists(TEMPLATES_FILE):
        return None
    try:
        with open(TEMPLATES_FILE, "r") as f:
            templates = json.load(f)
            return next((t for t in templates if t["id"] == template_id), None)
    except Exception as e:
        print(f"⚠️ Error loading template {template_id}: {e}")
    return None


def sanitize_scalar(value):
    """
    Ensures pandas-safe scalar values.
    Converts list -> string.
    """
    if isinstance(value, list):
        return "; ".join(str(v) for v in value if str(v).strip())
    return value


@invoice_upload_routes.route("/invoice/upload", methods=["POST"])
def upload_invoice():
    print("--- INVOICE UPLOAD REQUEST ---")

    file = request.files.get("file")
    process_type = request.form.get("processType")
    template_id = request.form.get("templateId")

    print(
        f"DEBUG: processType={process_type}, templateId={template_id}, file_present={file is not None}"
    )

    if not process_type:
        return {"error": "processType missing"}, 400

    if not file and not template_id:
        return {"error": "Excel file or Template ID must be provided"}, 400

    # ---------------------------
    # LOAD TEMPLATE
    # ---------------------------
    template = get_template_full(template_id)
    if template_id and not template:
        return {"error": "Template not found"}, 404

    mapping = (
        {f["id"]: f["displayText"] for f in template.get("fields", [])}
        if template
        else None
    )

    # ---------------------------
    # DATA EXTRACTION
    # ---------------------------
    try:
        # ========= VIRTUAL / TEMPLATE ONLY =========
        if not file:
            print("INFO: Virtual data flow (Template Defaults)")
            virtual_row = {}

            for field in template.get("fields", []):
                col_name = field.get("displayText") or field.get("name")
                default_val = sanitize_scalar(field.get("defaultValue", ""))
                virtual_row[col_name] = default_val

            if not virtual_row:
                return {"error": "Template has no fields for virtual processing"}, 400

            df = pd.DataFrame([virtual_row])

        # ========= FILE UPLOAD =========
        else:
            print("INFO: File upload flow")
            df = pd.read_excel(file)

            # 🔒 SANITIZE EXISTING DATAFRAME (CRITICAL)
            for col in df.columns:
                df[col] = df[col].apply(sanitize_scalar)

            # Apply template defaults
            if template:
                print("🔄 Applying Template Defaults for missing values...")

                for field in template.get("fields", []):
                    target_name = field.get("displayText") or field.get("name")
                    default_val = sanitize_scalar(field.get("defaultValue"))

                    if default_val is not None and default_val != "":
                        col_name = find_column_fuzzy(df, target_name)

                        if col_name and col_name in df.columns:
                            df[col_name] = df[col_name].fillna(default_val)

                            mask = (
                                df[col_name]
                                .astype(str)
                                .str.strip()
                                .isin(["", "nan", "None", "NaT"])
                            )
                            df.loc[mask, col_name] = default_val

        if df.empty:
            return {"error": "No data found to process"}, 400

    except Exception as e:
        print(f"ERROR: Exception during data loading: {str(e)}")
        return {"error": f"Failed to load data: {str(e)}"}, 500

    # ---------------------------
    # VALIDATION
    # ---------------------------
    try:
        print("🔍 Validating Mandatory Fields...")
        definitions = get_invoice_definitions()

        if definitions:
            required_fields = set()

            def extract_required_names(data):
                names = set()
                if isinstance(data, dict):
                    if data.get("required") is True and "name" in data:
                        names.add(data["name"])
                    for v in data.values():
                        names.update(extract_required_names(v))
                elif isinstance(data, list):
                    for item in data:
                        names.update(extract_required_names(item))
                return names

            required_fields = extract_required_names(definitions)
            print(f"📋 OTM Required Fields: {required_fields}")

            missing_errors = []

            for req_field in required_fields:
                if mapping and req_field in mapping:
                    column_name = find_column_fuzzy(df, mapping[req_field])
                else:
                    column_name = find_column_fuzzy(df, req_field)

                if column_name and column_name in df.columns:
                    col_data = (
                        df[column_name]
                        .astype(str)
                        .str.strip()
                        .replace({"nan": "", "None": "", "NaT": ""})
                    )
                    if (col_data == "").any():
                        missing_errors.append(
                            f"'{req_field}' (mapped to '{column_name}')"
                        )

            if missing_errors:
                err_msg = (
                    "Validation Failed: content missing for mandatory fields: "
                    + ", ".join(missing_errors)
                )
                print(f"❌ {err_msg}")
                return {"error": err_msg}, 400

            print("✅ Validation Passed.")

    except Exception as e:
        print(f"⚠️ Validation Warning: {e}")

    # ---------------------------
    # PROCESSING
    # ---------------------------
    try:
        if process_type == "xml":
            print("🔁 XML FLOW")

            def get_val(row, field_id, default_col):
                target_name = mapping.get(field_id) if mapping else default_col
                col_name = find_column_fuzzy(df, target_name)
                return (
                    str(row.get(col_name))
                    if col_name and col_name in df.columns
                    else "MISSING"
                )

            first_row = df.iloc[0]
            invoice_xid = get_val(first_row, "invoiceXid", "INVOICE_XID")
            invoice_num = get_val(first_row, "invoiceNumber", "INVOICE_NUM")

            xml_bytes, xml_string = build_invoice_xml(df, field_mapping=mapping)
            response_xml, transmission_no = post_to_otm(xml_bytes)

            invoice = Invoice(
                invoice_xid=invoice_xid,
                invoice_num=invoice_num,
                transmission_no=transmission_no,
                status="RECEIVED",
                request_xml=xml_string,
                response_xml=response_xml,
                error_message=None,
                source_type="XML",
            )

            db.session.add(invoice)
            db.session.commit()

            print("✅ XML SUCCESS")

            return jsonify(
                {
                    "message": "Processed successfully",
                    "invoiceXid": invoice_xid,
                    "invoiceNumber": invoice_num,
                    "transmission_no": transmission_no,
                }
            )

        elif process_type == "json":
            print("🔁 JSON FLOW")

            json_payload = build_invoice_json_from_dataframe(
                df, field_mapping=mapping
            )
            

            otm_response = post_excel_json_invoice_to_otm(json_payload)
            transmission_no = otm_response.get("transmissionNo") or otm_response.get(
                "id"
            )

            invoice = Invoice(
                invoice_xid=json_payload["invoiceXid"],
                invoice_num=json_payload["invoiceNumber"],
                transmission_no=transmission_no,
                status="RECEIVED",
                request_xml=None,
                request_json=json.dumps(json_payload),
                response_xml=str(otm_response),
                error_message=None,
                source_type="JSON",
            )

            db.session.add(invoice)
            db.session.commit()

            print("✅ JSON SUCCESS")

            return jsonify(
                {
                    "message": "Processed successfully",
                    "invoiceXid": json_payload["invoiceXid"],
                    "invoiceNumber": json_payload["invoiceNumber"],
                    "transmission_no": transmission_no,
                }
            )
    except Exception as e:
        print(f"❌ PROCESSING ERROR: {str(e)}")
        import traceback
        traceback.print_exc()
        return {"error": str(e)}, 500


@invoice_upload_routes.route("/invoice/extract-ocr", methods=["POST"])
def extract_ocr():
    print("--- OCR EXTRACTION REQUEST ---")
    file = request.files.get("file")
    if not file:
        return jsonify({"error": "No file uploaded"}), 400

    temp_path = os.path.join("temp_uploads", file.filename)
    os.makedirs("temp_uploads", exist_ok=True)
    file.save(temp_path)

    # Save a PERSISTENT copy for OTM attachment later (won't be deleted by finally)
    unique_id = uuid.uuid4().hex[:8]
    ext = os.path.splitext(file.filename)[-1] or ".pdf"
    persistent_path = os.path.join("temp_uploads", f"attach_{unique_id}{ext}")
    file.stream.seek(0)

    try:
        if file.filename.lower().endswith('.pdf'):
            raw_text = extract_text_from_pdf(temp_path)
        else:
            raw_text = extract_text_from_image(temp_path)
            
        print(f"Extracted Raw Text Length: {len(raw_text)}")
        
        from .llm_parser import parse_invoice_text_with_llm
        extracted_data = parse_invoice_text_with_llm(raw_text)

        # Save persistent copy for OTM document upload at confirmation time
        import shutil
        shutil.copy2(temp_path, persistent_path)

        # MIME Type detection
        mtype, _ = mimetypes.guess_type(persistent_path)
        if not mtype:
            mtype = "application/pdf" if file.filename.lower().endswith(".pdf") else "image/jpeg"

        # Return: raw text + file reference details (NOT the huge Base64 string)
        extracted_data["_raw_ocr_text"] = raw_text
        extracted_data["_document_path"] = persistent_path       # server-side path
        extracted_data["_document_filename"] = file.filename
        extracted_data["_document_mimetype"] = mtype

        return jsonify({"extracted_data": extracted_data})
    except Exception as e:
        print(f"OCR Error: {e}")
        return jsonify({"error": str(e)}), 500
    finally:
        if os.path.exists(temp_path):
            os.remove(temp_path)


@invoice_upload_routes.route("/invoice/confirm-physical", methods=["POST"])
def confirm_physical():
    print("--- CONFIRM PHYSICAL INVOICE ---")
    data = request.json
    if not data:
        return {"error": "No data provided"}, 400

    raw_ocr_text = data.pop("_raw_ocr_text", "")
    document_path = data.pop("_document_path", None)
    document_filename = data.pop("_document_filename", "invoice_document")
    document_mimetype = data.pop("_document_mimetype", "application/pdf")
    # Drop Base64 field in case old client sends it (no longer used)
    data.pop("_document_base64", None)

    try:
        # Convert the normalized extraction into a standard OTM DataFrame structure
        # (similar to how Excel logic builds a DF)
        rows = []
        for item in data.get("items", []):
            rows.append({
                "invoiceXid": data.get("invoiceNumber"),
                "invoiceNumber": data.get("invoiceNumber"),
                "invoiceDate": data.get("invoiceDate"),
                "serviceProvider": data.get("serviceProvider"),
                "currencyGid": data.get("currencyGid"),
                "domainName": data.get("domainName", "INTL"),
                "amount": item.get("amount"),
                "shipmentGid": item.get("shipmentGid"),
                "costTypeGid": item.get("costTypeGid")
            })

        # Fallback if no items at all
        if not rows:
            from datetime import datetime
            rows.append({
                "invoiceXid": data.get("invoiceNumber", f"INV_{datetime.utcnow().timestamp()}"),
                "invoiceNumber": data.get("invoiceNumber"),
                "invoiceDate": data.get("invoiceDate"),
                "serviceProvider": data.get("serviceProvider"),
                "currencyGid": data.get("currencyGid"),
                "domainName": data.get("domainName", "INTL"),
                "amount": 0,
            })

        df = pd.DataFrame(rows)
        
        # Explicit mapping for the physical flow to ensure json_builder knows where to find values
        mapping = {
            "invoiceXid": "invoiceXid",
            "invoiceNumber": "invoiceNumber",
            "serviceProvider": "serviceProvider",
            "currencyGid": "currencyGid",
            "amount": "amount",
            "costTypeGid": "costTypeGid"
        }

        # Now use existing JSON logic
        json_payload = build_invoice_json_from_dataframe(df, field_mapping=mapping)

        # Force correct invoicexid to avoid conflict testing
        from uuid import uuid4
        json_payload["invoiceXid"] = f"INV_{uuid4().hex[:6]}"

        print("\n================ JSON SENT TO OTM ================\n")
        print(json.dumps(json_payload, indent=2))
        print("\n==================================================\n")

        # Create the Audit log BEFORE attempting to post to capture intent and early errors
        from .models import PhysicalInvoiceAudit
        
        audit_log = PhysicalInvoiceAudit(
            invoice_xid=json_payload["invoiceXid"],
            invoice_num=json_payload["invoiceNumber"],
            ocr_raw_text=raw_ocr_text,
            llm_parsed_json=data.get("additionalMetadata", {}),
            user_modified_json=data,
            final_otm_payload=json_payload,
            status="PENDING",
            error_message=None
        )
        db.session.add(audit_log)
        db.session.commit()

        try:
            otm_response = post_excel_json_invoice_to_otm(json_payload)
            transmission_no = otm_response.get("transmissionNo") or otm_response.get("id")
            
            audit_log.transmission_no = transmission_no
            audit_log.otm_raw_response = str(otm_response)
            audit_log.status = "SUCCESS"
            
            invoice = Invoice(
                invoice_xid=json_payload["invoiceXid"],
                invoice_num=json_payload["invoiceNumber"],
                transmission_no=transmission_no,
                status="RECEIVED",
                request_json=json.dumps(json_payload),
                response_xml=str(otm_response),
                source_type="PHYSICAL"
            )
            db.session.add(invoice)            
            db.session.commit()
            
            # --- ATTACH DOCUMENT TO OTM INVOICE ---
            if document_path and os.path.exists(document_path):
                invoice_xid = json_payload.get("invoiceXid")
                success, attach_res = attach_document_to_invoice(
                    invoice_xid,
                    document_path,
                    document_filename,
                    document_mimetype
                )
                if not success:
                    err_msg = f"Document attachment failed: {attach_res}"
                    print(f"⚠️ {err_msg}")
                    audit_log.error_message = ((audit_log.error_message or "") + " | " + err_msg).lstrip(" | ")
                else:
                    print(f"✅ Document attached to invoice {invoice_xid}")
                    audit_log.otm_raw_response = (audit_log.otm_raw_response or "") + f" | Doc: {attach_res}"

                # Clean up the persistent temp file
                try:
                    os.remove(document_path)
                except Exception:
                    pass
            elif document_path:
                print(f"⚠️ Persistent file not found for attachment: {document_path}")
                audit_log.error_message = ((audit_log.error_message or "") + " | Persistent file missing").lstrip(" | ")

            db.session.commit()

        except Exception as otm_err:
            audit_log.error_message = str(otm_err)
            audit_log.status = "FAILED"
            db.session.commit()
            raise otm_err

        return jsonify({
            "message": "Physical invoice processed",
            "transmission_no": transmission_no
        })
    except Exception as e:
        print(f"CONFIRM ERROR: {e}")
        return {"error": str(e)}, 500