"""Convert a PDF-compatible Illustrator file into the generator's artwork model.
Original source is read only. Requires PyMuPDF, pypdf and fontTools.
"""
import argparse, base64, io, json, math, re, unicodedata
from pathlib import Path
import fitz
from fontTools.ttLib import TTFont
from pypdf import PdfReader


def convert(source, target, name):
    doc=fitz.open(source)
    reader=PdfReader(source)
    fonts={}
    screens=[]
    for page_no,page in enumerate(doc):
        runs=[]
        def visit(text,cm,tm,fd,fs):
            if text.strip() and fd:
                runs.append({'text':text.strip(),'font':str(fd.get('/BaseFont','')).lstrip('/'),
                    'x':tm[4]*cm[0]+tm[5]*cm[2]+cm[4],
                    'y':page.rect.height-(tm[4]*cm[1]+tm[5]*cm[3]+cm[5])})
        reader.pages[page_no].extract_text(visitor_text=visit)
        fontkeys={}
        for ref,ext,typ,base,*rest in page.get_fonts():
            key=re.sub(r'[^a-zA-Z0-9_]','_',Path(source).stem)+'_f'+str(ref)
            fontkeys[base]=key
            if key not in fonts:
                data=doc.extract_font(ref)[3]
                if data:
                    # PDF subset fonts omit metadata required by browser font sanitizers.
                    font=TTFont(io.BytesIO(data))
                    for name_id,value in [(1,key),(2,'Regular'),(4,key),(6,key),(16,key),(17,'Regular')]:
                        font['name'].setName(value,name_id,3,1,0x409)
                    cmap=font.getBestCmap() or {}
                    supported=[code for code,glyph in cmap.items() if code in [32,160] or font['glyf'][glyph].numberOfContours!=0]
                    font.flavor='woff'
                    web=io.BytesIO();font.save(web)
                    fonts[key]={'data':'data:font/woff;base64,'+base64.b64encode(web.getvalue()).decode(),'map':{},
                        'unicodeRange':','.join('U+'+format(code,'X') for code in supported)}
        fields=[]
        def normalized(text):
            return re.sub(r'\s+','',unicodedata.normalize('NFKC',text))
        # Text traces preserve font changes that get_text(dict) merges when PDF
        # subsets share the same family name. Character positions also retain TJ
        # positioning, which visitor_text can report at the preceding run origin.
        for trace in page.get_texttrace():
            if not trace['chars'] or trace.get('type',0) not in [0,1]: continue
            chars=trace['chars']
            alltext=''.join(chr(c[0]) for c in chars)
            norm=normalized(alltext)
            matching=[r for r in runs if normalized(r['text']) and
                (norm.startswith(normalized(r['text'])[:32]) or normalized(r['text']).startswith(norm[:32]))]
            x,y=chars[0][2]
            nearest=min(matching or runs,key=lambda r: math.hypot(r['x']-x,r['y']-y),default={})
            key=fontkeys.get(nearest.get('font'),'')
            lines=[]
            for char in chars:
                if not lines or abs(char[2][1]-lines[-1][-1][2][1])>0.2:
                    lines.append([])
                lines[-1].append(char)
            for line in lines:
                text=''.join(chr(c[0]) for c in line)
                if not text.strip(): continue
                x,y=line[0][2]
                rgb=trace['color']
                ink='#'+''.join(format(round(c*255),'02x') for c in rgb) if isinstance(rgb,tuple) else '#1d1e3c'
                fields.append({'id':f't{len(fields)+1}','kind':'text','text':text,
                    'x':round(x,4),'y':round(y,4),'width':round(max(8,max(c[3][2] for c in line)-x),4),
                    'fontSize':round(trace['size'],4),'lineHeight':1.5,'font':key,
                    'color':ink,'fit':True})
        # Remove real text only; retain images, vector ornaments, backgrounds and logos.
        for block in page.get_text('dict')['blocks']:
            if block['type']==0:
                for line in block['lines']:
                    for span in line['spans']:
                        page.add_redact_annot(fitz.Rect(span['bbox']),fill=False,cross_out=False)
        page.apply_redactions(images=0,graphics=0,text=0)
        if page.get_text().strip(): raise ValueError('Some source text was not removed from the background')
        png=page.get_pixmap(matrix=fitz.Matrix(2,2),alpha=False).tobytes('png')
        screens.append({'id':f'p{page_no+1}','type':'artwork','title':f'{name} · {page_no+1}','blocks':[],
            'artwork':{'version':1,'width':page.rect.width,'height':page.rect.height,
            'background':'data:image/png;base64,'+base64.b64encode(png).decode(), 'elements':fields}})
    project={'name':name,'w':794,'h':1123,'format':'a4p','preset':'doctor',
        'palette':{'ink':'#1D1E3C','body':'#3F506E','bg':'#F5F6FA','important':'#E6EAFF','warning':'#F7EAE4','remember':'#9AABDB','additional':'#F5F6FA'},
        'screens':screens,'selected':screens[0]['id'],'artworkFonts':fonts,'template':'','materialLogo':'',
        'pageFooter':{'enabled':False}}
    payload={'doctorOneTemplateVersion':1,'meta':{'name':name,'format':'a4p','w':794,'h':1123,'screenCount':len(screens),
        'description':'Układ z Illustratora: edytowalne teksty, ilustracje i dekoracje zachowane w tle.'},'project':project}
    Path(target).write_text(json.dumps(payload,ensure_ascii=False,separators=(',',':')))
    print(name, 'pages',len(screens),'editable text fields',sum(len(p['artwork']['elements']) for p in screens),'bytes',Path(target).stat().st_size)

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('source');p.add_argument('target');p.add_argument('--name',required=True);a=p.parse_args()
    convert(a.source,a.target,a.name)
