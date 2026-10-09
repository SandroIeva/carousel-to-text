import os, re, base64, requests
from flask import Flask, request, jsonify, render_template, Response
from urllib.parse import urlparse

app = Flask(__name__)
app.config['MAX_CONTENT_LENGTH'] = 20_000
ACTOR = 'themineworks~instagram-post-scraper'
MODEL = os.getenv('GEMINI_MODEL', 'gemini-2.5-flash-lite')

def normalize_url(value):
    parsed = urlparse(value.strip())
    if parsed.scheme not in ('https', 'http') or parsed.hostname not in ('instagram.com', 'www.instagram.com'):
        raise ValueError('Bitte einen gültigen öffentlichen Instagram-Post-Link eingeben.')
    match = re.fullmatch(r'/(p|reel)/([A-Za-z0-9_-]+)/?', parsed.path)
    if not match:
        raise ValueError('Der Link muss zu einem Instagram-Post (/p/...) führen.')
    return f'https://www.instagram.com/{match.group(1)}/{match.group(2)}/'

def fetch_post(url):
    key = os.environ['APIFY_TOKEN']
    endpoint = f'https://api.apify.com/v2/acts/{ACTOR}/run-sync-get-dataset-items'
    resp = requests.post(endpoint, params={'token': key, 'timeout': 180}, json={'postUrls':[url], 'usernames':[], 'proxyConfiguration':{'useApifyProxy':True}}, timeout=210)
    resp.raise_for_status()
    data = resp.json()
    posts = [row for row in data if isinstance(row,dict) and row.get('shortCode') and row.get('type')]
    if not posts:
        raise ValueError('Der Scraper hat keinen öffentlichen Post zurückgegeben.')
    return posts[0]

def slide_urls(post):
    urls = []
    if isinstance(post.get('childPosts'),list):
        for child in post['childPosts']:
            if not isinstance(child,dict): continue
            image = child.get('displayUrl')
            if isinstance(image,str) and image.startswith('https://'): urls.append(image)
    if not urls and isinstance(post.get('images'),list):
        for item in post['images']:
            image = item if isinstance(item,str) else (item.get('url') or item.get('displayUrl')) if isinstance(item,dict) else None
            if isinstance(image,str) and image.startswith('https://'): urls.append(image)
    if not urls and isinstance(post.get('displayUrl'),str): urls=[post['displayUrl']]
    return urls[:25]

def get_image(url):
    # Media URLs are supplied by Apify, not by the user. Limit hosts, response bytes and redirects.
    from urllib.parse import urlparse
    host = (urlparse(url).hostname or '').lower()
    if not (host.endswith('.cdninstagram.com') or host == 'cdninstagram.com' or host.endswith('.fbcdn.net') or host == 'fbcdn.net'):
        raise ValueError('Unerwartete Bildquelle. Verarbeitung abgebrochen.')
    with requests.get(url,timeout=25,stream=True,allow_redirects=False) as resp:
        resp.raise_for_status()
        ctype = resp.headers.get('content-type','').split(';')[0].lower()
        if ctype not in ('image/jpeg','image/png','image/webp'):
            raise ValueError(f'Nicht unterstütztes Bildformat: {ctype}')
        pieces=[]; count=0
        for chunk in resp.iter_content(65536):
            count += len(chunk)
            if count > 8_000_000: raise ValueError('Bild ist zu groß (8 MB).')
            pieces.append(chunk)
    return b''.join(pieces),ctype

def transcribe(url):
    blob,mime = get_image(url)
    endpoint = f'https://generativelanguage.googleapis.com/v1beta/models/{MODEL}:generateContent'
    prompt = ('Transcribe ALL visible text from this social-media carousel slide accurately, preserving its original language, heading hierarchy, reading order, punctuation, numbers, and list structure. '
              'Output only clean Markdown transcription. Never paraphrase, translate, invent missing words, or add commentary. '
              'If a text fragment is unreadable, write [unleserlich]. For charts, transcribe visible labels and data exactly; do not infer values.')
    payload={'contents':[{'parts':[{'text':prompt},{'inlineData':{'mimeType':mime,'data':base64.b64encode(blob).decode('ascii')}}]}], 'generationConfig':{'temperature':0}}
    resp=requests.post(endpoint,headers={'x-goog-api-key':os.environ['GEMINI_API_KEY']},json=payload,timeout=90)
    resp.raise_for_status()
    obj=resp.json()
    parts=obj.get('candidates',[{}])[0].get('content',{}).get('parts',[])
    result='\n'.join(p.get('text','') for p in parts if isinstance(p,dict)).strip()
    if not result: raise ValueError('Gemini hat keinen Text zurückgegeben.')
    return result

def markdown(post,url,slides):
    owner=str(post.get('ownerUsername') or 'unbekannt')
    caption=str(post.get('caption') or '')
    header=f'# Instagram Carousel\n\nSource: {url}\nCreator: @{owner}\nTotal slides: {len(slides)}\n'
    body=''.join(f'\n---\n\n## Slide {i}\n\n{content}\n' for i,content in enumerate(slides,1))
    return header+body+'\n---\n\n## Original Caption\n\n'+(caption or '[Keine Caption vorhanden]')+'\n'

@app.get('/')
def index(): return render_template('index.html')

@app.post('/api/extract')
def extract():
    try:
        if not os.getenv('APIFY_TOKEN') or not os.getenv('GEMINI_API_KEY'):
            return jsonify(error='API-Keys fehlen auf dem Server. Bitte .env konfigurieren.'),503
        url=normalize_url((request.get_json(silent=True) or {}).get('url',''))
        post=fetch_post(url)
        images=slide_urls(post)
        if not images: raise ValueError('Keine Bilder gefunden. Video-Slides werden in Version 1 nicht unterstützt.')
        output=[]
        for img in images:
            try: output.append(transcribe(img))
            except Exception as ex: output.append('[Slide konnte nicht gelesen werden]')
        return jsonify(markdown=markdown(post,url,output), slides=len(output),failed=sum(x.startswith('[Slide konnte') for x in output))
    except ValueError as ex: return jsonify(error=str(ex)),422
    except requests.HTTPError as ex:
        code=ex.response.status_code if ex.response is not None else 502
        app.logger.exception('Upstream error')
        return jsonify(error=f'Der externe Dienst hat einen Fehler zurückgegeben (HTTP {code}).'),502
    except Exception:
        app.logger.exception('Extraction failed')
        return jsonify(error='Extraktion fehlgeschlagen. Bitte Server-Logs prüfen.'),500

if __name__=='__main__': app.run(host='127.0.0.1',port=int(os.environ.get('PORT',5000)),debug=False)
