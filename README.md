# Nano Vendas

Busca de empresas para prospecção B2B. *A fonte para vender melhor.*

Funciona como um Google voltado para prospecção: você digita segmento e cidade e encontra empresas do Google Maps com telefone, site, nota, avaliações e sinais de oportunidade. A busca roda no navegador sobre uma base já coletada: é instantânea e não gasta nada por consulta.

## Como funciona
1. **Coleta** (GitHub Actions, toda segunda e sob demanda): roda o projeto aberto [gosom/google-maps-scraper](https://github.com/gosom/google-maps-scraper) (MIT) com as buscas de `pipeline/consultas.txt`.
2. **Normalização**: `pipeline/normalizar.py` junta tudo em `data/empresas.json`, atualiza quem já existe e remove empresas fechadas.
3. **Publicação**: o mesmo workflow publica o site no GitHub Pages.

## Na plataforma
- **Buscar**: texto livre ("dentista curitiba sem site", "contador bh"), com sinônimos, siglas de cidade e filtros de oportunidade. O que já está na base aparece na hora.
- **Busca ao vivo**: se o termo não está na base (ex.: "dedetizadora curitiba"), a plataforma dispara a coleta no GitHub Actions, acompanha e mostra as empresas em 1 a 2 minutos. A busca passa a ser atualizada toda semana. Exige conectar um token do GitHub uma vez (fine-grained, só este repositório, Actions: read/write, Contents: read), guardado apenas no navegador.
- **Mensagem**: escolhe o fato mais específico de cada empresa (profissional elogiado pelo nome nas avaliações, avaliações sem resposta, sem site, comparação com a mais avaliada da cidade, perfil sem horário, tema mais elogiado). Curta, humana, sem preço, sem promessa, termina com pergunta. "Outra abordagem" troca o gancho.
- **WhatsApp em um toque**: abre o wa.me com a mensagem pronta e registra no funil.
- **Funil**: lotes de 5, status de Pesquisando a Ganho, bloqueio de quem já foi abordado, exportar JSON/CSV. Fica salvo no navegador.

## Configurar (uma vez)
1. GitHub → **Settings → Pages → Source: GitHub Actions**.
2. **Actions → Coletar empresas e publicar → Run workflow** (opcional: buscas separadas por `;`).
3. Para mudar as buscas semanais, edite `pipeline/consultas.txt`.

Dados públicos do Google Maps. A coleta automatizada vai contra os termos de uso do Google; use com moderação e respeite a LGPD.
