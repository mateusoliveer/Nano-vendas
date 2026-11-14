# Nano Vendas

Busca de empresas para prospecção B2B. *A fonte para vender melhor.*

Funciona como um Google voltado para prospecção: você digita segmento e cidade e encontra empresas do Google Maps com telefone, site, nota, avaliações e sinais de oportunidade. A busca roda no navegador sobre uma base já coletada: é instantânea e não gasta nada por consulta.

## Como funciona
1. **Coleta** (GitHub Actions, toda segunda e sob demanda): roda o projeto aberto [gosom/google-maps-scraper](https://github.com/gosom/google-maps-scraper) (MIT) com as buscas de `pipeline/consultas.txt`.
2. **Normalização**: `pipeline/normalizar.py` junta tudo em `data/empresas.json`, atualiza quem já existe e remove empresas fechadas.
3. **Publicação**: o mesmo workflow publica o site no GitHub Pages.

## Na plataforma
- **Buscar**: texto livre, cidade, categoria e filtros de oportunidade (sem site, site é rede social, menos de 20 avaliações, abaixo da média local, nota abaixo de 4,2, sem horário, celular). Ordena por oportunidade.
- **Abordar**: gera diagnóstico e rascunho de mensagem com fatos reais do perfil e comparação com a média local. Você revisa, confirma o WhatsApp e abre o link wa.me.
- **Funil**: lotes de 5, status de Pesquisando a Ganho, bloqueio de quem já foi abordado, exportar JSON/CSV. Fica salvo no navegador.

## Configurar (uma vez)
1. GitHub → **Settings → Pages → Source: GitHub Actions**.
2. **Actions → Coletar empresas e publicar → Run workflow** (opcional: buscas separadas por `;`).
3. Para mudar as buscas semanais, edite `pipeline/consultas.txt`.

Dados públicos do Google Maps. A coleta automatizada vai contra os termos de uso do Google; use com moderação e respeite a LGPD.
