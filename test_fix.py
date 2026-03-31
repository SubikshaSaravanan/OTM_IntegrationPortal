from backend.otm_rest_service import get_document_content_from_otm
import os

doc_gid = "INTL.DOC_SHIPMENT_111000_1774714612"
ok, data = get_document_content_from_otm(doc_gid)

print(f"Success: {ok}")
if ok:
    print(f"Content length: {len(data)} bytes")
    print(f"Start of content: {data[:20]}")
else:
    print(f"Error: {data}")
