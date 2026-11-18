PROJETO NOIR — ETAPAS PARA APK ANDROID TV

ETAPAS CONCLUÍDAS:
1. ✅ manifest.json — Criado com nome, descrição, cores, ícones placeholder
2. ✅ sw.js — Service worker criado para cache offline e PWA functionality
3. ✅ offline.html — Página de fallback quando sem conexão
4. ✅ index.html — Service worker registrado no final do body

PRÓXIMAS ETAPAS PARA APK ANDROID TV:

ETAPA 5: OTIMIZAR UI PARA TV/LEANBACK
- O layout atual (grid de cards, hero carousel) precisa de adaptação para navegação com controle remoto (DPAD/arrows)
- Necessário adicionar elementos de foco visível (.focus-visible styles)
- O hero strip de 5 stats precisa ser navegável com setas do controle
- Grid de cards precisa de tabindex ou navegação lógica com setas
- O hero carousel drift precisa ser pausável na TV

ETAPA 6: ADICIONAR ÍCONES E ASSETS
- Criar favicon.ico ou logo.png como ícone do app
- Android TV requer ícones: 48dp, 72dp, 96dp, 144dp, 192dp, 512dp
- Adicionar ícones no manifest.json com caminhos reais

ETAPA 7: PACOTAR COMO WEBAPK
Como NÃO há Android SDK na máquina, as opções são:

OPÇÃ A: TERMUX (no Android device)
- Instalar termux-x11 ou usarapt-get
- comando: pkg install python-networkx build-essential
- Usar ferramenta: "webapk" ou "pwa2apk"
- Ou simplesmente: Chrome/Edge "Adicionar à tela inicial" → cria atalho WebAPK

OPÇÃO B: CONVERSOR ON-LINE
- Services como pwa2apk.netlify.app ou add2home.com
- Faz upload do index.html, manifest.json, sw.js
- Download do APK gerado
- Funciona para TV se manifest tiver orientationportrait/landscape certo

OPÇÃO C: CORDOVA/CAPACITOR (se instalar Node+Java)
- npm install @capacitor/core @capacitor/cli
- npx cap add android
- npx cap copy
- npx cap open android (requer JDK + Android SDK - talvez não funcione sem SDK)

OPÇÃO D: EXECUTAR NO CHROME/EDGE ANDROID TV
- Acessar site no navegador Android TV
- Menu → "Adicionar à tela inicial" ou "Instalar app"
- Cria atalho WebAPK nativo
- Funciona sem nenhuma modificação extra se o manifest estiver correto

ETAPA 8: AJUSTES FINAIS PARA TV

1. player.html no Android TV:
   - Os embeds do SuperFlix/StreamBetter funcionam em iframe
   - Controles de vídeo precisam ser acessíveis via remote
   - Pode ser necessário adicionar meta viewport otimizado para TV

2. navegação por controle remoto:
   Adicionar estilos CSS:
   ```css
   :focus-visible { outline: 2px solid var(--gold); outline-offset: 2px; }
   [tabindex] { outline: none; }
   ```
   
   Adicionar tabindex nos elementos interativos principais:
   - Botões de navegação (setas, Enter)
   - Links de filme/série
   - Botões de conta/controles

3. Performance na TV:
   - O catalog.json tem ~42k títulos → inicialização pode ser lenta
   - Considerar lazy-load do catálogo ou paginação na entrada
   - O hero carousel já tem otimização (opacity + drift 60s)

RESUMO DO QUE FAZER AGORA:

1. Criar ícones adequados e atualizar manifest.json com caminhos reais
2. Testar o site no navegador Chrome/Edge do celular/TV Android
3. Usar "Adicionar à tela inicial" → isso cria um WebAPK funcional
4. Se precisar de APK personalizado: usar termoux no Android ou conversor online
5. Otimizar a navegação DPAD no index.html (adicionar focus-visible e tabindex)

O site já está pronto para ser "instalado" como app em Android TV via Chrome/Edge.
Apenas o passo de packaging/APK real depende da disponibilidade de ferramentas no dispositivo Android.

PRÓXIMO PASSO IMEDIATO: Testar no celular/TV Android e usar "Adicionar à tela inicial" do Chrome.