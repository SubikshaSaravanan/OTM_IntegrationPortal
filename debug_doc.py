import requests
import json
import os
from backend.config import Config

doc_gid = "INTL.DOC_SHIPMENT_111000_1774714612"
content_gid = "DOC_SHIPMENT_111000_1774714612_C"

# 1. Individual item fetch
url_item = f"{Config.OTM_REST_URL}/documents/{doc_gid}/contents/{content_gid}"
headers = {"Accept": "application/vnd.oracle.resource+json"}
auth = (Config.OTM_USERNAME, Config.OTM_PASSWORD)

print(f"Fetching Item: {url_item}")
r1 = requests.get(url_item, headers=headers, auth=auth, timeout=30)
print(f"Status: {r1.status_code}")
if r1.status_code == 200:
    data = r1.json()
    # Masking large content for output
    readable_data = {k: (v[:100] + "...") if isinstance(v, str) and len(v) > 100 else v for k, v in data.items()}
    print(json.dumps(readable_data, indent=2))
    print(f"Has documentContent: {'documentContent' in data}")
    print(f"Has blobContent: {'blobContent' in data}")
else:
    print(r1.text)

# 2. Download URL fetch (Custom Action)
# The canonical link was: .../custom-actions/download/documents/{doc_gid}/contents/{content_gid}
url_download = f"{Config.OTM_REST_URL}/custom-actions/download/documents/{doc_gid}/contents/{content_gid}"
print(f"\nFetching Download: {url_download}")
# Download action might return binary or JSON with content
r2 = requests.get(url_download, headers=headers, auth=auth, timeout=30)
print(f"Status: {r2.status_code}")
print(f"Content-Type: {r2.headers.get('Content-Type')}")
if r2.status_code == 200:
    if "json" in r2.headers.get('Content-Type', ''):
        data2 = r2.json()
        readable_data2 = {k: (v[:100] + "...") if isinstance(v, str) and len(v) > 100 else v for k, v in data2.items()}
        print(json.dumps(readable_data2, indent=2))
    else:
        print(f"Binary content received ({len(r2.content)} bytes)")
else:
    print(r2.text)
