"""Separate reviewed graphic regions from a PDF-compatible source into image elements.

The original file is read only. A manifest supplies page-local regions; text and
large background shapes stay intact. Pixel comparison verifies that recombining
all generated image layers reproduces the pre-split background exactly.
"""
import argparse,base64,io,json,math
from pathlib import Path
import fitz
from PIL import Image,ImageChops

def data_png(image):
    out=io.BytesIO();image.save(out,format='PNG');return 'data:image/png;base64,'+base64.b64encode(out.getvalue()).decode()

def split_graphics(source,template,manifest,target):
    project=json.loads(Path(template).read_text());regions=json.loads(Path(manifest).read_text())['pages']
    doc=fitz.open(source);scale=2
    if len(doc)!=len(project['project']['screens']) or len(regions)!=len(doc):raise ValueError('Page counts differ')
    for no,page in enumerate(doc):
        art=project['project']['screens'][no]['artwork']
        # Match the text-free rendering used by the existing template converter.
        for block in page.get_text('dict')['blocks']:
            if block['type']==0:
                for line in block['lines']:
                    for span in line['spans']:page.add_redact_annot(fitz.Rect(span['bbox']),fill=False,cross_out=False)
        page.apply_redactions(images=0,graphics=0,text=0)
        original=Image.open(io.BytesIO(page.get_pixmap(matrix=fitz.Matrix(scale,scale),alpha=False).tobytes('png'))).convert('RGB')
        selected=[]
        for i,region in enumerate(regions[no]):
            rect=fitz.Rect(region['rect']);box=(math.floor(rect.x0*scale),math.floor(rect.y0*scale),math.ceil(rect.x1*scale),math.ceil(rect.y1*scale))
            aligned=fitz.Rect(*(v/scale for v in box))
            if not page.rect.contains(rect):raise ValueError('Graphic region extends beyond page')
            for prev in selected:
                if aligned.intersects(prev['rect']):raise ValueError('Graphic regions overlap')
            selected.append({'region':region,'rect':aligned,'box':box,'id':region.get('id',f'graphic-{no+1}-{i+1}')})
        # Remove only image resources wholly contained in a reviewed region.
        # Large raster shadows and gradient backgrounds must remain untouched.
        removed=set()
        for spec in selected:
            if spec['region'].get('type')!='image':continue
            matches=[]
            for record in page.get_images(full=True):
                xref=record[0]
                if xref in removed:continue
                placements=page.get_image_rects(xref)
                if placements and all(spec['rect'].contains(r) for r in placements):matches.append(xref)
            if not matches:raise ValueError('No contained image found for '+spec['id'])
            for xref in matches:page.delete_image(xref);removed.add(xref)
        for spec in selected:
            if spec['region'].get('type','vector')=='vector':page.add_redact_annot(spec['rect'],fill=False,cross_out=False)
        page.apply_redactions(images=0,graphics=fitz.PDF_REDACT_LINE_ART_REMOVE_IF_COVERED,text=fitz.PDF_REDACT_TEXT_NONE)
        background=Image.open(io.BytesIO(page.get_pixmap(matrix=fitz.Matrix(scale,scale),alpha=False).tobytes('png'))).convert('RGB')
        diff=ImageChops.difference(original,background)
        channels=diff.split();changed=ImageChops.lighter(ImageChops.lighter(channels[0],channels[1]),channels[2]).point(lambda x:255 if x else 0)
        rebuilt=background.copy();fields=[]
        for spec in selected:
            box=spec['box'];mask=changed.crop(box)
            if not mask.getbbox():raise ValueError('Empty graphic: '+spec['id'])
            crop=original.crop(box).convert('RGBA');crop.putalpha(mask)
            rebuilt.paste(crop,(box[0],box[1]),crop)
            fields.append({'id':spec['id'],'kind':'image','text':spec['region']['label'],'src':data_png(crop),
                'x':box[0]/scale,'y':box[1]/scale,'width':(box[2]-box[0])/scale,'height':(box[3]-box[1])/scale,
                'sourceGraphic':True,'imageFit':'contain'})
        if ImageChops.difference(original,rebuilt).getbbox():raise ValueError('Graphics split changed pixels outside the selected regions')
        art['background']=data_png(background);art['version']=3
        # Idempotent: replace this manifest's existing image fields on regeneration.
        ids={f['id'] for f in fields}
        art['elements']=[e for e in art['elements'] if e['id'] not in ids]+fields
        print('page',no+1,'editable graphics',len(fields),'pixel reconstruction exact')
    project['meta']['description']='Edytowalne bloki tekstu, zdjęcie i ikony. Dekoracje strony zachowane w tle.'
    Path(target).write_text(json.dumps(project,ensure_ascii=False,separators=(',',':')))

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('source');p.add_argument('template');p.add_argument('manifest');p.add_argument('target');a=p.parse_args()
    split_graphics(a.source,a.template,a.manifest,a.target)
