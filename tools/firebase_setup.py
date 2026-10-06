"""Registers the Android app in Firebase (if missing) and writes store-app/google-services.json.
Reads the service-account JSON from env FIREBASE_SA_JSON. Never prints secrets."""
import json, os, sys, time, base64, urllib.request, urllib.parse
import jwt  # pyjwt

PKG = "com.app.hdmarket"
sa = json.loads(os.environ["FIREBASE_SA_JSON"])
now = int(time.time())
assertion = jwt.encode({"iss": sa["client_email"], "scope": "https://www.googleapis.com/auth/cloud-platform https://www.googleapis.com/auth/firebase",
                        "aud": "https://oauth2.googleapis.com/token", "iat": now, "exp": now + 3000}, sa["private_key"], algorithm="RS256")
def call(url, data=None, headers=None, method=None):
    req = urllib.request.Request(url, data=data, headers=headers or {}, method=method)
    try:
        with urllib.request.urlopen(req, timeout=60) as r: return json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e:
        print("HTTP", e.code, e.read().decode()[:400]); sys.exit(1)
tok = call("https://oauth2.googleapis.com/token", urllib.parse.urlencode({"grant_type": "urn:ietf:params:oauth:grant-type:jwt-bearer", "assertion": assertion}).encode(),
           {"Content-Type": "application/x-www-form-urlencoded"})["access_token"]
H = {"Authorization": "Bearer " + tok, "Content-Type": "application/json"}
proj = sa["project_id"]; base = f"https://firebase.googleapis.com/v1beta1/projects/{proj}"
apps = call(base + "/androidApps?pageSize=100", headers=H).get("apps", [])
app = next((a for a in apps if a.get("packageName") == PKG), None)
if not app:
    op = call(base + "/androidApps", json.dumps({"packageName": PKG, "displayName": "HD Market"}).encode(), H, "POST")
    for _ in range(30):
        time.sleep(3)
        op = call("https://firebase.googleapis.com/v1beta1/" + op["name"], headers=H)
        if op.get("done"): break
    app = op.get("response") or {}
    if not app.get("appId"): print("app creation failed"); sys.exit(1)
cfg = call(f"https://firebase.googleapis.com/v1beta1/{app['name'] if 'name' in app else 'projects/'+proj+'/androidApps/'+app['appId']}/config", headers=H)
open("store-app/google-services.json", "wb").write(base64.b64decode(cfg["configFileContents"]))
print("google-services.json written for", app.get("appId"))
