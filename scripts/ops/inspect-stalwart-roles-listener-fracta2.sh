#!/usr/bin/env bash
# Read-only configured Stalwart 1.1.0 diagnosis: default roles and listeners.
# Requires root solely to read the private recovery credential locally.
# No configuration writes, restart, export or backup.
set -Eeuo pipefail
[[ $(id -u) == 0 ]] || { echo 'USAGE: sudo bash inspect-stalwart-roles-listener-fracta2.sh'; exit 2; }
[[ $(systemctl is-active stalwart.service) == active ]] || { echo 'REFUSE: inactive service'; exit 2; }
[[ $(systemctl show -p Environment --value stalwart.service) == *STALWART_RECOVERY_MODE=true* ]] || { echo 'REFUSE: not in recovery mode'; exit 2; }
python3 - <<'PY'
import base64,json,urllib.request,urllib.error
from pathlib import Path
p=Path('/etc/stalwart/stalwart.env')
secrets=dict(x.split('=',1) for x in p.read_text().splitlines() if '=' in x and not x.startswith('#'))
credential=secrets.get('STALWART_RECOVERY_ADMIN','')
assert credential.startswith('admin:') and len(credential)>8,'missing pinned recovery credential'
auth='Basic '+base64.b64encode(credential.encode()).decode()
body=json.dumps({'using':['urn:ietf:params:jmap:core','urn:stalwart:jmap'],
 'methodCalls':[
  ['x:Role/query',{},'r1'],
  ['x:Authentication/get',{},'a1'],
  ['x:NetworkListener/query',{},'l1'],
  ['x:NetworkListener/get',{'ids':None},'l2'],
 ]}).encode()
for path in ['/jmap','/api']:
 try:
  req=urllib.request.Request('http://127.0.0.1:8080'+path,data=body,headers={'Authorization':auth,'Content-Type':'application/json'},method='POST')
  with urllib.request.urlopen(req,timeout=10) as res: reply=json.load(res)
  if not isinstance(reply,dict) or 'methodResponses' not in reply: continue
  break
 except urllib.error.HTTPError as e:
  if e.code==404: continue
  print('API_HTTP_ERROR='+str(e.code)); raise SystemExit(3)
else:
 print('API_NO_VALID_JMAP_ENDPOINT');raise SystemExit(3)
print('API_ENDPOINT='+path)
responses={x[2]:(x[0],x[1]) for x in reply['methodResponses']}
for key in ['r1','a1','l1','l2']:
 if key not in responses or responses[key][0]=='error' or responses[key][0].endswith('/error'):
  print('JMAP_ERROR_'+key+'='+str(responses.get(key,('missing',{}))[0]));raise SystemExit(4)
r=responses['r1'][1]; a=responses['a1'][1]; l=responses['l1'][1];g=responses['l2'][1]
print('ROLE_COUNT='+str(len(r.get('ids',[]))))
print('AUTH_OBJECT_COUNT='+str(len(a.get('list',[]))))
for obj in a.get('list',[]):
 for field in ['defaultUserRoleIds','defaultAdminRoleIds','defaultGroupRoleIds']:
  val=obj.get(field,{})
  print('AUTH_'+field+'='+json.dumps(val,sort_keys=True))
print('LISTENER_COUNT='+str(len(l.get('ids',[]))))
for obj in g.get('list',[]):
  safe={k:obj.get(k) for k in ['id','name','protocol','bind','implicitTls','useTls']}
  print('LISTENER='+json.dumps(safe,sort_keys=True))
print('READ_ONLY_DIAGNOSTIC_COMPLETE')
PY
