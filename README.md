# Nano Vendas

Plataforma minimalista de prospecção B2B da Nano Vendas. *A fonte para vender melhor.*

Abra `index.html` no navegador (ou publique no GitHub Pages). Sem instalação, sem servidor.

## O que faz
- **Leads** com tudo que a abordagem exige: empresa, local, canais, decisor + fonte, WhatsApp + fonte, diagnóstico, oportunidade, serviços (Google, SEO, GEO, AEO, tráfego pago, IA, automação, CRM), ticket sugerido e mensagem.
- **Lotes de 5**: numeração automática do lote atual.
- **Checagem da mensagem** em tempo real: termina com pergunta, curta, cita algo específico, chama o decisor pelo nome, sem clichês, sem preço, sem promessas.
- **Link wa.me** com texto preenchido — só liberado quando o lead está completo e o WhatsApp foi marcado como verificado. Ao abrir, o lead passa para *Abordado*.
- **Sem repetição**: bloqueia empresa, telefone ou site já abordados.
- **Funil**: Pesquisando → Pronto → Abordado → Respondeu → Reunião → Proposta → Ganho/Perdido, com taxa de conversa.
- **Backup**: exportar JSON/CSV e importar JSON (dados ficam no navegador).

## Link web
`python3 tools/build-artifact.py` gera `dist/nano-vendas.html` (página única, CSS/JS/logo embutidos), publicada como link privado no claude.ai. No link, os leads ficam no banco do próprio artifact (visível só para o dono/editores); abrindo `index.html` localmente, ficam no navegador.
