import requests
import json

payload = {
    "shipmentGid": "INTL.111000",
    "statusCodeGid": "D1",
    "eventDate": "2026-03-30T10:00:00+05:30"
}

r = requests.post("http://localhost:5000/api/tracking/tracking-events", json=payload)
with open("out.json", "w") as f:
    json.dump(r.json(), f, indent=2)
