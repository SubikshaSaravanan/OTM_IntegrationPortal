import requests, json

BASE = (
    "https://otmgtm-test-hipro.otmgtm.us-phoenix-1.ocs.oraclecloud.com"
    "/logisticsRestApi/resources-int/v2/metadata-catalog/documents"
)
AUTH = ("INTL.INT01", "changeme")

r = requests.get(BASE, headers={"Accept": "application/json"}, auth=AUTH, timeout=30)
data = r.json()
schemas = data.get("components", {}).get("schemas", {})

targets = ["documents.contents", "documents.contexts"]
for name in targets:
    s = schemas.get(name, {})
    props = s.get("properties", {})
    print(f"\n{'='*60}")
    print(f"Schema: {name}")
    print(f"{'='*60}")
    print(json.dumps(props, indent=2)[:4000])

# Also list ALL schema names that contain 'document'
print("\n\nAll schema names:")
for k in sorted(schemas.keys()):
    print(" ", k)
