import base64
import getpass
import json
import ssl
import urllib.request

try:
    import certifi
    SSL_CONTEXT = ssl.create_default_context(cafile=certifi.where())
except ImportError:
    SSL_CONTEXT = ssl.create_default_context()

B2_API = 'https://api.backblazeb2.com/b2api/v2'
BUCKET_NAME = 'notebook-pwa'
CORS_RULES = json.load(open('b2-cors.json', encoding='utf-8'))


def request(url, payload=None, token=None, basic=None):
    body = json.dumps(payload).encode('utf-8') if payload is not None else None
    headers = {'Content-Type': 'application/json'}
    if token:
        headers['Authorization'] = token
    if basic:
        encoded = base64.b64encode(f'{basic[0]}:{basic[1]}'.encode()).decode()
        headers['Authorization'] = f'Basic {encoded}'
    request = urllib.request.Request(url, data=body, headers=headers)
    with urllib.request.urlopen(request, context=SSL_CONTEXT) as response:
        return json.loads(response.read())


key_id = input('B2 Key ID: ').strip()
application_key = getpass.getpass('B2 Application Key: ')
auth = request(f'{B2_API}/b2_authorize_account', basic=(key_id, application_key))
account_id = auth['accountId']
api_url = auth['apiUrl']
auth_token = auth['authorizationToken']
buckets = request(f'{api_url}/b2api/v2/b2_list_buckets', {'accountId': account_id}, token=auth_token)['buckets']
bucket = next((item for item in buckets if item['bucketName'] == BUCKET_NAME), None)
if bucket is None:
    raise SystemExit(f'找不到 Bucket: {BUCKET_NAME}')
request(f'{api_url}/b2api/v2/b2_update_bucket', {
    'accountId': account_id,
    'bucketId': bucket['bucketId'],
    'bucketType': bucket['bucketType'],
    'corsRules': CORS_RULES,
}, token=auth_token)
print(f'已为 {BUCKET_NAME} 配置 CORS，允许 GitHub Pages 和本地开发地址。')
