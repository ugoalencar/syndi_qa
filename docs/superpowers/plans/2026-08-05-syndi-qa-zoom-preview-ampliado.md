# Zoom Preview Ampliado Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add interactive zoom/pan controls to the existing fullscreen image modal in Syndi_qa.

**Architecture:** Keep all behavior in the existing Vue app (`js/qa.js`) and modal markup (`syndi_qa.html`). The modal continues to load `urlImagem(imagemAmpliada, 'zoom')`; the new code only changes how that preview is transformed on screen.

**Tech Stack:** Vue 3 global build already present in `js/vue.global.js`, Bootstrap modal already present, plain CSS in `css/qa.css`, no new dependencies.

## Global Constraints

- Use the existing modal `#modalImagem`; do not introduce a new modal.
- Continue using the preview URL `urlImagem(imagemAmpliada, 'zoom')`; never load the original heavy image for zoom.
- Default state is image fitted to screen: scale `1`, offsets `0`.
- Click toggles fit/detail zoom; wheel zooms in/out; drag pans while zoomed; reset button returns to fit.
- Reset zoom when opening a photo, navigating previous/next, or closing the modal.
- Port `3001` is this project's app port; do not touch port `3000`.
- Do not commit unless the user explicitly asks.

---

### Task 1: Add zoom state and interaction functions

**Files:**
- Modify: `js/qa.js`

**Interfaces:**
- Consumes: existing `imagemAmpliada`, `listaAmpliada`, `ampliarImagem(nomeComposto, lista)`, `navegarAmpliada(delta)`.
- Produces: Vue bindings for `zoomEscala`, `zoomOffsetX`, `zoomOffsetY`, `zoomArrastando`, `estiloImagemAmpliada`, `classeImagemAmpliada`, `resetarZoomImagem`, `alternarZoomImagem`, `ajustarZoomImagem`, `iniciarArrastoZoom`, `moverArrastoZoom`, `finalizarArrastoZoom`.

- [ ] **Step 1: Add zoom state after `listaAmpliada`**

In `js/qa.js`, after:

```js
        const imagemAmpliada = ref(null);
        const listaAmpliada = ref([]);
```

Insert:

```js
        const zoomEscala = ref(1);
        const zoomOffsetX = ref(0);
        const zoomOffsetY = ref(0);
        const zoomArrastando = ref(false);
        const zoomMoveuDuranteArrasto = ref(false);
        let zoomInicioX = 0;
        let zoomInicioY = 0;
        let zoomOffsetInicioX = 0;
        let zoomOffsetInicioY = 0;

        const ZOOM_MIN = 1;
        const ZOOM_MAX = 4;
        const ZOOM_DETALHE = 2;
        const ZOOM_PASSO_WHEEL = 0.25;
        const ZOOM_LIMIAR_CLIQUE = 4;

        const estiloImagemAmpliada = computed(() => ({
            transform: `translate(${zoomOffsetX.value}px, ${zoomOffsetY.value}px) scale(${zoomEscala.value})`
        }));

        const classeImagemAmpliada = computed(() => ({
            'qa-img-zoomada': zoomEscala.value > 1,
            'qa-img-arrastando': zoomArrastando.value
        }));
```

- [ ] **Step 2: Add zoom helper functions before `ampliarImagem`**

Insert immediately before the existing comment `// Zoom de miniatura`:

```js
        function limitarZoom(valor) {
            return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, valor));
        }

        function aplicarEscalaZoom(novaEscala) {
            zoomEscala.value = limitarZoom(novaEscala);
            if (zoomEscala.value === ZOOM_MIN) {
                zoomOffsetX.value = 0;
                zoomOffsetY.value = 0;
            }
        }

        function resetarZoomImagem() {
            zoomEscala.value = ZOOM_MIN;
            zoomOffsetX.value = 0;
            zoomOffsetY.value = 0;
            zoomArrastando.value = false;
            zoomMoveuDuranteArrasto.value = false;
        }

        function alternarZoomImagem() {
            if (zoomMoveuDuranteArrasto.value) {
                zoomMoveuDuranteArrasto.value = false;
                return;
            }
            if (zoomEscala.value === ZOOM_MIN) {
                aplicarEscalaZoom(ZOOM_DETALHE);
            } else {
                resetarZoomImagem();
            }
        }

        function ajustarZoomImagem(event) {
            event.preventDefault();
            const direcao = event.deltaY < 0 ? 1 : -1;
            aplicarEscalaZoom(zoomEscala.value + (direcao * ZOOM_PASSO_WHEEL));
        }

        function iniciarArrastoZoom(event) {
            if (zoomEscala.value <= ZOOM_MIN) return;
            zoomArrastando.value = true;
            zoomMoveuDuranteArrasto.value = false;
            zoomInicioX = event.clientX;
            zoomInicioY = event.clientY;
            zoomOffsetInicioX = zoomOffsetX.value;
            zoomOffsetInicioY = zoomOffsetY.value;
            if (event.currentTarget && event.currentTarget.setPointerCapture) {
                event.currentTarget.setPointerCapture(event.pointerId);
            }
        }

        function moverArrastoZoom(event) {
            if (!zoomArrastando.value) return;
            const dx = event.clientX - zoomInicioX;
            const dy = event.clientY - zoomInicioY;
            if (Math.abs(dx) > ZOOM_LIMIAR_CLIQUE || Math.abs(dy) > ZOOM_LIMIAR_CLIQUE) {
                zoomMoveuDuranteArrasto.value = true;
            }
            zoomOffsetX.value = zoomOffsetInicioX + dx;
            zoomOffsetY.value = zoomOffsetInicioY + dy;
        }

        function finalizarArrastoZoom(event) {
            if (!zoomArrastando.value) return;
            zoomArrastando.value = false;
            if (event && event.currentTarget && event.currentTarget.releasePointerCapture) {
                try { event.currentTarget.releasePointerCapture(event.pointerId); } catch (err) {}
            }
        }
```

- [ ] **Step 3: Reset zoom on open and navigation**

Change `ampliarImagem` from:

```js
        function ampliarImagem(nomeComposto, lista) {
            imagemAmpliada.value = nomeComposto;
            listaAmpliada.value = lista;
            nextTick(() => {
                bootstrap.Modal.getOrCreateInstance(document.getElementById('modalImagem')).show();
            });
        }
```

to:

```js
        function ampliarImagem(nomeComposto, lista) {
            resetarZoomImagem();
            imagemAmpliada.value = nomeComposto;
            listaAmpliada.value = lista;
            nextTick(() => {
                bootstrap.Modal.getOrCreateInstance(document.getElementById('modalImagem')).show();
            });
        }
```

Change `navegarAmpliada` from:

```js
        function navegarAmpliada(delta) {
            if (!imagemAmpliada.value || !listaAmpliada.value.length) return;
            const idx = listaAmpliada.value.indexOf(imagemAmpliada.value);
            const total = listaAmpliada.value.length;
            imagemAmpliada.value = listaAmpliada.value[(idx + delta + total) % total];
        }
```

to:

```js
        function navegarAmpliada(delta) {
            if (!imagemAmpliada.value || !listaAmpliada.value.length) return;
            const idx = listaAmpliada.value.indexOf(imagemAmpliada.value);
            const total = listaAmpliada.value.length;
            imagemAmpliada.value = listaAmpliada.value[(idx + delta + total) % total];
            resetarZoomImagem();
        }
```

- [ ] **Step 4: Reset on modal close**

In the `hidden.bs.modal` handler, change:

```js
            document.getElementById('modalImagem').addEventListener('hidden.bs.modal', () => {
                imagemAmpliada.value = null;
                listaAmpliada.value = [];
            });
```

to:

```js
            document.getElementById('modalImagem').addEventListener('hidden.bs.modal', () => {
                resetarZoomImagem();
                imagemAmpliada.value = null;
                listaAmpliada.value = [];
            });
```

- [ ] **Step 5: Return the zoom bindings**

In the `return` object, replace:

```js
            imagemAmpliada, listaAmpliada, ampliarImagem, navegarAmpliada,
```

with:

```js
            imagemAmpliada, listaAmpliada, ampliarImagem, navegarAmpliada,
            zoomEscala, zoomOffsetX, zoomOffsetY, zoomArrastando,
            estiloImagemAmpliada, classeImagemAmpliada,
            resetarZoomImagem, alternarZoomImagem, ajustarZoomImagem,
            iniciarArrastoZoom, moverArrastoZoom, finalizarArrastoZoom,
```

- [ ] **Step 6: Syntax check**

Run: `node --check js/qa.js`

Expected: no output and exit code `0`.

---

### Task 2: Wire modal markup to zoom controls

**Files:**
- Modify: `syndi_qa.html`

**Interfaces:**
- Consumes: bindings produced by Task 1.
- Produces: user-facing modal events for click, wheel, drag and reset.

- [ ] **Step 1: Replace modal image body markup**

In `syndi_qa.html`, replace:

```html
                    <div class="modal-body d-flex align-items-center justify-content-center p-0">
                        <img v-if="imagemAmpliada" :src="urlImagem(imagemAmpliada, 'zoom')" :alt="imagemAmpliada" id="imgAmpliada">
                    </div>
```

with:

```html
                    <div class="modal-body p-0">
                        <div
                            class="qa-modal-zoom-area"
                            @wheel="ajustarZoomImagem"
                            @pointerdown="iniciarArrastoZoom"
                            @pointermove="moverArrastoZoom"
                            @pointerup="finalizarArrastoZoom"
                            @pointerleave="finalizarArrastoZoom"
                            @click="alternarZoomImagem"
                        >
                            <img
                                v-if="imagemAmpliada"
                                :src="urlImagem(imagemAmpliada, 'zoom')"
                                :alt="imagemAmpliada"
                                id="imgAmpliada"
                                :style="estiloImagemAmpliada"
                                :class="classeImagemAmpliada"
                                draggable="false"
                            >
                        </div>
                    </div>
```

- [ ] **Step 2: Add reset control to footer**

In the modal footer, replace:

```html
                    <div class="modal-footer border-0">
                        <div class="info-imagem">
                            <span>{{ imagemAmpliada || '' }}</span>
                        </div>
                    </div>
```

with:

```html
                    <div class="modal-footer border-0">
                        <div class="info-imagem">
                            <span>{{ imagemAmpliada || '' }}</span>
                            <span class="separator">•</span>
                            <span>Zoom {{ Math.round(zoomEscala * 100) }}%</span>
                        </div>
                        <button type="button" class="btn btn-outline-light btn-sm" :disabled="zoomEscala === 1" @click="resetarZoomImagem">
                            <i class="bi bi-arrow-counterclockwise"></i> Resetar zoom
                        </button>
                    </div>
```

---

### Task 3: Add modal zoom CSS

**Files:**
- Modify: `css/qa.css`

**Interfaces:**
- Consumes: modal classes added in Task 2.
- Produces: correct fit/zoom/pan visual behavior.

- [ ] **Step 1: Add CSS before the `@media (max-width: 900px)` block**

In `css/qa.css`, before:

```css
@media (max-width: 900px) {
```

insert:

```css
/* Zoom interativo no modal de imagem ampliada - a imagem continua vindo do preview tamanho=zoom. */
.qa-modal-zoom-area {
    width: 100%;
    height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    background-color: #0a0a0a;
    cursor: zoom-in;
    user-select: none;
    touch-action: none;
}

.qa-modal-zoom-area #imgAmpliada {
    max-width: 100%;
    max-height: 100vh;
    object-fit: contain;
    transform-origin: center center;
    transition: transform 120ms ease-out;
    will-change: transform;
    pointer-events: none;
}

.qa-modal-zoom-area #imgAmpliada.qa-img-zoomada {
    cursor: grab;
}

.qa-modal-zoom-area:has(#imgAmpliada.qa-img-zoomada) {
    cursor: grab;
}

.qa-modal-zoom-area:has(#imgAmpliada.qa-img-arrastando) {
    cursor: grabbing;
}

.qa-modal-zoom-area #imgAmpliada.qa-img-arrastando {
    transition: none;
}
```

- [ ] **Step 2: Syntax/light check**

Run: `node --check js/qa.js`

Expected: no output and exit code `0`.

---

### Task 4: Browser verification

**Files:**
- No source changes expected.

**Interfaces:**
- Consumes: running app at `http://localhost:3001`.
- Produces: observed PASS/FAIL for the real modal behavior.

- [ ] **Step 1: Start app if not already running**

Run: `npm start`

Expected: server logs `Syndi_qa rodando em http://localhost:3001`.

- [ ] **Step 2: Smoke status endpoint**

Run:

```powershell
Invoke-WebRequest -UseBasicParsing "http://localhost:3001/api/status" | Select-Object -ExpandProperty Content
```

Expected:

```json
{"ok":true}
```

- [ ] **Step 3: Drive modal in browser**

Using the running app:

1. Open `http://localhost:3001`.
2. Select a GTIN with at least one image.
3. Click a thumbnail or its zoom button.
4. Confirm the footer shows `Zoom 100%` and the reset button is disabled.
5. Click the image area once.
6. Confirm the footer shows `Zoom 200%` and reset is enabled.
7. Use mouse wheel over the image; confirm the footer changes in 25% steps, bounded between 100% and 400%.
8. Drag the image while zoomed; confirm the image pans instead of selecting text or native-dragging the image.
9. Click **Resetar zoom**; confirm footer returns to `Zoom 100%`.
10. Navigate previous/next; confirm zoom resets.
11. Close and reopen modal; confirm zoom starts at 100%.

- [ ] **Step 4: Full test suite**

Run: `npm test`

Expected: all tests pass; no new test failures.
