# Correções sugeridas — https://www.obramax.com.br

Gerado a partir de `report.json` (score original: 46/100, nota D).

Cada seção mostra **um exemplo real** capturado no site, com a correção sugerida ao lado — não é um exemplo genérico de documentação, é o HTML de verdade que o audit encontrou.

Total de ocorrências cobertas por essas correções: **118**.

---
### Elemento oculto ainda focável (`aria-hidden-focus`) — 3 ocorrências

Exemplo real: `.lojaobramax-minicart-0-x-openIconContainer`

**Antes:**
```html
<div role="presentation" aria-hidden="true" class="pa4 pointer lojaobramax-minicart-0-x-openIconContainer">
```

**Depois:**
```html
<div tabindex="-1" role="presentation" aria-hidden="true" class="pa4 pointer lojaobramax-minicart-0-x-openIconContainer">
```

> Elemento com aria-hidden="true" ainda é focável (ex: dentro de um drawer fechado) — tabindex="-1" remove do fluxo de tab enquanto estiver oculto.

---

### Botões sem nome acessível (`button-name`) — 9 ocorrências

Exemplo real: `.vtex-flex-layout-0-x-stretchChildrenWidth.pr0.items-stretch > .vtex-flex-layout-0-x-flexCol.ml0.mr0 > .vtex-flex-layout-0-x-flexColChild.pb0 > .vtex-mega-menu-2-x-triggerContainer[data-id="mega-menu-trigger-button"]`

**Antes:**
```html
<button data-id="mega-menu-trigger-button" class="vtex-mega-menu-2-x-triggerContainer pointer">
```

**Depois:**
```html
<button data-id="mega-menu-trigger-button" class="vtex-mega-menu-2-x-triggerContainer pointer" aria-label="Abrir menu de departamentos">
```

> Botão sem texto visível para leitor de tela nem agente — adiciona aria-label="Abrir menu de departamentos" descrevendo a ação real do botão.

---

### Contraste de cor insuficiente (`color-contrast`) — 9 ocorrências

Exemplo real: `li[data-group-code="6119"] > div[data-platform="web"] > .ins-element-text.ins-selectable-element[data-no-menu-bar="true"] > .ins-product-content[data-disable-settings="height"][data-selected-layout="layout-3-1"] > .ins-product-element > .ins-erase-container[data-selected-layout="layout-3-5"] > .ins-wrap-layout-triple[data-element-name="Layout"][data-selected-layout="layout-3-5"] > .ins-layout-block-wrapper.ins-element-select-menu[data-min-width="5"]:nth-child(2) > .ins-whole-price-container[data-min-height="40"][data-unique-index="2"] > .ins-dynamic-text-wrapper.ins-element-dynamic-text[data-min-width="10"] > div[data-dynamic-text-value="<p><br></p>"][data-lines="3"][aria-label=""] > .ins-product-link.ins-dynamic-text-product-link[title="<p><br></p>"] > .ins-whole-price-header`

**Antes:**
```html
color: #ef7f00; background: #ffffff;
```

**Depois:**
```html
color: #ffffff; background: #c96400; /* mesmo tom, mais escuro — sobe o contraste para ~4.6:1 */
```

> Contraste insuficiente entre texto e fundo — escurecer o laranja da marca (ou usar texto escuro) resolve sem descaracterizar a cor.

---

### Landmarks duplicados sem label distinto (`landmark-unique`) — 2 ocorrências

Exemplo real: `#slider-items-tdjy58n`

**Antes:**
```html
<section aria-label="slider" id="slider-items-tdjy58n" class="w-100 flex items-center relative vtex-slider-layout-0-x-sliderLayoutContainer vtex-slider-layout-0-x-sliderLayoutContainer--full-banner" style="touch-action: pan-y;">
```

**Depois:**
```html
<section aria-label="Banner promocional principal" id="slider-items-tdjy58n" class="w-100 flex items-center relative vtex-slider-layout-0-x-sliderLayoutContainer vtex-slider-layout-0-x-sliderLayoutContainer--full-banner" style="touch-action: pan-y;">
```

> Dois landmarks com o mesmo papel e sem label distinto (ex: dois <section aria-label="slider">) — dê um aria-label específico pra cada um, descrevendo o que aquele carrossel mostra.

---

### Controles interativos aninhados (`nested-interactive`) — 60 ocorrências

Exemplo real: `li[data-group-code="6119"] > div[data-platform="web"] > .ins-element-text.ins-selectable-element[data-no-menu-bar="true"] > .ins-product-content[data-disable-settings="height"][data-selected-layout="layout-3-1"] > .ins-product-element > .ins-wrap-layout-double.ins-erase-container[data-selected-layout="layout-2-1"] > .ins-layout-wrapper[data-element-name="Layout"][data-erase="true"] > .ins-layout-block-wrapper.ins-element-select-menu[data-min-width="5"]:nth-child(1) > div[data-min-height="281"][data-unique-index="1"][data-block-config="1.1"] > .ins-element-image.ins-element-product-image.ins-template-image > .ins-responsive-banner-image[data-element-name="Product Image"][data-variable-name="Image"]`

**Antes:**
```html
<div id="image-1647932527287" class="ins-widget-element i..." data-override-name="true" data-element-name="Product Image" data-variable-name="Image" data-disable-setting...="width" ondrop="return false;" ondragstart="return false;" data-erase="false" data-removable="true" role="img" ...>
```

**Depois:**
```html
<div id="image-1647932527287" class="ins-widget-element i..." data-override-name="true" data-element-name="Product Image" data-variable-name="Image" data-disable-setting...="width" ondrop="return false;" ondragstart="return false;" data-erase="false" data-removable="true" role="img" ...>
<!-- ⚠ elemento focável ESCONDIDO dentro deste container precisa de tabindex="-1"
     ou aria-hidden="true" — o axe não expõe qual filho é, requer inspeção manual -->
```

> Este container tem um descendente focável (axe não informa qual) — a correção é no elemento filho, não neste container. Requer inspeção manual no DevTools pra achar o culpado exato.

---

### Conteúdo fora de qualquer landmark (`region`) — 3 ocorrências

Exemplo real: `.vtex-render__container-id-full-banner`

**Antes:**
```html
<div class="vtex-render__container-id-full-banner">
```

**Depois:**
```html
<section aria-label="Conteúdo complementar">
  <div class="vtex-render__container-id-full-banner">
</section>
```

> Conteúdo solto fora de qualquer landmark — envolve num <section>/<aside> com aria-label pra ficar navegável por região.

---

### Imagem (role="img") sem texto alternativo (`role-img-alt`) — 30 ocorrências

Exemplo real: `li[data-group-code="6119"] > div[data-platform="web"] > .ins-element-text.ins-selectable-element[data-no-menu-bar="true"] > .ins-product-content[data-disable-settings="height"][data-selected-layout="layout-3-1"] > .ins-product-element > .ins-wrap-layout-double.ins-erase-container[data-selected-layout="layout-2-1"] > .ins-layout-wrapper[data-element-name="Layout"][data-erase="true"] > .ins-layout-block-wrapper.ins-element-select-menu[data-min-width="5"]:nth-child(1) > div[data-min-height="281"][data-unique-index="1"][data-block-config="1.1"] > .ins-element-image.ins-element-product-image.ins-template-image > .ins-responsive-banner-image[data-element-name="Product Image"][data-variable-name="Image"]`

**Antes:**
```html
<div id="image-1647932527287" class="ins-widget-element i..." data-override-name="true" data-element-name="Product Image" data-variable-name="Image" data-disable-setting...="width" ondrop="return false;" ondragstart="return false;" data-erase="false" data-removable="true" role="img" ...>
```

**Depois:**
```html
<div id="image-1647932527287" class="ins-widget-element i..." data-override-name="true" data-element-name="Product Image" data-variable-name="Image" data-disable-setting...="width" ondrop="return false;" ondragstart="return false;" data-erase="false" data-removable="true" role="img" aria-label="Product Image" ...>
```

> Elemento com role="img" sem texto alternativo — precisa de um aria-label descritivo. Nesse caso específico só consegui inferir o nome interno do widget ("Product Image"); o ideal é que esse texto venha dinamicamente do nome real do produto, não seja hardcoded.

---

### Schema.org/Product incompleto (sem price/availability) (`product-schema`) — 1 ocorrência


**Antes:**
```html
{
  "@context": "https://schema.org",
  "@type": "Product",
  "name": "..."
  // sem "offers" -> sem price nem availability
}
```

**Depois:**
```html
{
  "@context": "https://schema.org",
  "@type": "Product",
  "name": "...",
  "offers": {
    "@type": "Offer",
    "price": "349.90",
    "priceCurrency": "BRL",
    "availability": "https://schema.org/InStock"
  }
}
```

> O bloco Product existe mas não declara "offers" — sem isso, um agente de compra não consegue confirmar preço nem disponibilidade programaticamente, mesmo que o texto apareça na tela para um humano.

---

### llms.txt ausente (`llms-txt`) — 1 ocorrência


**Antes:**
```html
(arquivo não existe)
```

**Depois:**
```html
# Nome da loja
> Loja de materiais de construção — atacado e varejo.

Agentes de compra automatizados são bem-vindos. Páginas de produto seguem
schema.org/Product com preço e disponibilidade em tempo real.

## Páginas relevantes
- /sitemap.xml — mapa completo de produtos
- /institucional/politica-de-trocas — política de trocas e devoluções

```

> llms.txt é uma convenção emergente (não um padrão W3C) que sinaliza explicitamente a agentes de IA que o site é "amigável" a eles e aponta pra onde buscar informação estruturada.
