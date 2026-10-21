"""Convert a PDF-compatible Illustrator file into the generator's artwork model.
Original source is read only. Requires PyMuPDF, pypdf and fontTools.
"""
import argparse, base64, io, json, math, re, unicodedata, statistics
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
                if (not lines or abs(char[2][1]-lines[-1][-1][2][1])>0.2 or
                    char[2][0]-lines[-1][-1][3][2]>trace['size']*2 or char[2][0]<lines[-1][-1][2][0]-trace['size']):
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
                    'color':ink,'fit':False,
                    'letterSpacing':round(statistics.median([line[i+1][2][0]-c[3][2] for i,c in enumerate(line[:-1])]),4) if len(line)>1 else 0,
                    'charX':[round(c[2][0]-x,4) for c in line]})
        # Merge contiguous runs on the same baseline, then consecutive lines of a
        # paragraph. Keep exact source positions/styles for the untouched layout.
        rows=[]
        for field in sorted(fields,key=lambda f:(round(f['y'],1),f['x'])):
            prev=rows[-1] if rows else None
            if (prev and abs(prev['y']-field['y'])<0.3 and abs(prev['fontSize']-field['fontSize'])<0.15
                and -0.5<=field['x']-prev['right']<=max(3,field['fontSize']*0.8)):
                prev['pieces'].append(field);prev['right']=max(prev['right'],field['x']+field['width'])
            else:
                rows.append({'x':field['x'],'y':field['y'],'right':field['x']+field['width'],
                    'fontSize':field['fontSize'],'pieces':[field]})
        def main_style(row):
            return max(row['pieces'],key=lambda p:len(p['text']))
        groups=[]
        for row in rows:
            candidates=[]
            for group in groups:
                last=group[-1];fs=row['fontSize'];gap=row['y']-last['y']
                if (abs(row['x']-last['x'])<max(1.5,fs*0.15) and abs(fs-last['fontSize'])<0.15
                    and fs*1.05<=gap<=fs*2.25
                    and (main_style(last)['font']==main_style(row)['font'] or fs>=14)
                    and main_style(last)['color']==main_style(row)['color']):
                    candidates.append(group)
            if candidates:
                min(candidates,key=lambda g:row['y']-g[-1]['y']).append(row)
            else: groups.append([row])
        fields=[]
        for group in sorted(groups,key=lambda g:(g[0]['y'],g[0]['x'])):
            pieces=[p for row in group for p in row['pieces']]
            base=max(pieces,key=lambda p:sum(len(q['text']) for q in pieces if q['font']==p['font']))
            x=group[0]['x'];y=group[0]['y'];fs=base['fontSize']
            text=' '.join(''.join(p['text'] for p in row['pieces']).strip() for row in group)
            text=re.sub(r'(?<=\w)- (?=[a-ząćęłńóśźż])','',text)
            original=[]
            for piece in pieces:
                original.append({'text':piece['text'],'x':round(piece['x']-x,4),'y':round(piece['y']-y,4),
                    'charX':piece['charX'],'font':piece['font'],'fontSize':piece['fontSize'],
                    'color':piece['color'],'letterSpacing':piece['letterSpacing']})
            leading=statistics.median([group[i+1]['y']-row['y'] for i,row in enumerate(group[:-1])])/fs if len(group)>1 else 1.5
            fields.append({'id':f't{len(fields)+1}','kind':'text','text':text,'originalText':text,'originalLines':original,
                'x':x,'y':y,'width':max(r['right'] for r in group)-x,'fontSize':fs,'lineHeight':round(leading,4),
                'font':base['font'],'color':base['color'],'letterSpacing':round(statistics.median(p['letterSpacing'] for p in pieces),4),
                'fit':False})
        # An outlined button label is part of the background. A separate link
        # region makes its entire original button clickable without repainting it.
        for drawing in page.get_drawings():
            rect=drawing['rect'];fill=drawing.get('fill')
            if (fill and rect.y0>page.rect.height*0.85 and rect.width>page.rect.width*0.35
                and 15<rect.height<45 and max(fill)-min(fill)<0.25 and max(fill)<0.65):
                fields.append({'id':f'link{len(fields)+1}','kind':'link','text':'Przycisk · Doctor.One',
                    'x':rect.x0,'y':rect.y0,'width':rect.width,'height':rect.height,'link':'https://www.doctor.one'})
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
            'artwork':{'version':2,'width':page.rect.width,'height':page.rect.height,
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
