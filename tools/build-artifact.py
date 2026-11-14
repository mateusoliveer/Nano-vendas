"""Gera dist/nano-vendas.html: página única (CSS, JS e logo embutidos) para publicar como link web."""
import base64, pathlib, re
root = pathlib.Path(__file__).resolve().parent.parent
html = (root / 'index.html').read_text()
css = (root / 'styles.css').read_text()
js = (root / 'app.js').read_text()
mark = 'data:image/png;base64,' + base64.b64encode((root / 'assets/mark.png').read_bytes()).decode()

head = re.search(r'<head>(.*?)</head>', html, re.S).group(1)
body = re.search(r'<body>(.*?)</body>', html, re.S).group(1)
title = re.search(r'<title>.*?</title>', head).group(0)
fonts = re.search(r'<link href="https://fonts.googleapis.com[^>]+>', head).group(0)
body = body.replace('<script src="app.js"></script>', '<script>\n' + js + '\n</script>')
body = body.replace('src="assets/mark.png"', f'src="{mark}"')
out = '\n'.join([
    title,
    '<meta name="claude:viewport-fit-sides" content="cover">',
    '<meta name="description" content="Prospecção B2B da Nano Vendas: pesquisa, qualificação e abordagem hipersegmentada.">',
    fonts,
    '<style>\n' + css + '\n</style>',
    body.strip(),
])
(root / 'dist').mkdir(exist_ok=True)
(root / 'dist/nano-vendas.html').write_text(out)
print('ok', len(out))
