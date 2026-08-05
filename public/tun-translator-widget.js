(function () {
  "use strict";

  var script = document.currentScript;
  if (!script) return;

  var containerId = script.getAttribute("data-container") || "tun-western-armenian-translator";
  var widgetKey = script.getAttribute("data-widget-key") || "";
  var endpoint = script.getAttribute("data-endpoint") || "";
  var publishableKey = script.getAttribute("data-supabase-key") || "";
  var configuredTheme = script.getAttribute("data-theme") || "auto";
  var configuredSource = script.getAttribute("data-source-language") || "en";
  var configuredTarget = script.getAttribute("data-target-language") || "hyw";
  var configuredBranding = true; // Fail closed until the server confirms branding may be removed.
  var marker = typeof Symbol === "function" ? Symbol.for("tun.translator.widget.instances") : "__tunTranslatorWidgetInstances__";
  var instances = window[marker] || new Set();
  window[marker] = instances;

  if (!widgetKey || !endpoint || !publishableKey || instances.has(containerId)) return;
  var host = document.getElementById(containerId);
  if (!host) return;
  instances.add(containerId);
  host.setAttribute("data-tun-widget-mounted", "true");

  var root = host.shadowRoot || host.attachShadow({ mode: "open" });
  var languageNames = { en: "English", hyw: "Western Armenian", hye: "Eastern Armenian" };
  var allowedTargets = { en: ["hyw"], hyw: ["en"], hye: ["hyw"] };

  function element(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (typeof text === "string") node.textContent = text;
    return node;
  }

  var style = document.createElement("style");
  style.textContent = [
    ":host{all:initial;display:block;color-scheme:light dark}",
    "*,*::before,*::after{box-sizing:border-box}",
    ".tun-widget{--red:rgb(219,24,43);--bg:#fff;--surface:#fff;--soft:#f7f7f8;--text:#202124;--muted:#676b73;--border:#d9dadd;--shadow:0 8px 28px rgba(20,24,32,.10);font-family:Nunito,Arial,sans-serif;color:var(--text);background:var(--bg);border:1px solid var(--border);border-top:5px solid var(--red);border-radius:7px;box-shadow:var(--shadow);padding:16px;max-width:760px;width:100%;line-height:1.45}",
    ".tun-widget.dark{--bg:#15171a;--surface:#1d2024;--soft:#24282d;--text:#f4f5f6;--muted:#b4b8be;--border:#3a3f46;--shadow:0 10px 32px rgba(0,0,0,.32)}",
    ".header{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:13px}.title{font-size:18px;font-weight:800}.brand{font-size:12px;color:var(--muted);font-weight:700}.controls{display:grid;grid-template-columns:minmax(0,1fr) 42px minmax(0,1fr);gap:9px;align-items:end;margin-bottom:12px}.field{display:grid;gap:5px}.field label{font-size:12px;color:var(--muted);font-weight:800}.field select,.input{width:100%;border:1px solid var(--border);border-radius:5px;background:var(--surface);color:var(--text);font:inherit;padding:9px 10px}.swap{height:40px;border:1px solid var(--border);border-radius:5px;background:var(--soft);color:var(--text);font:inherit;font-size:18px;cursor:pointer}.swap:focus-visible,.field select:focus-visible,.input:focus-visible,.translate:focus-visible,.copy:focus-visible{outline:3px solid rgba(219,24,43,.28);outline-offset:2px}.input{min-height:132px;resize:vertical;line-height:1.55}.actions{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:10px}.count{font-size:12px;color:var(--muted)}.translate{border:0;border-radius:5px;background:var(--red);color:#fff;font:inherit;font-weight:800;padding:10px 18px;cursor:pointer;min-width:126px}.translate:disabled{opacity:.6;cursor:wait}.status{min-height:22px;margin:10px 0 0;font-size:13px;color:var(--muted)}.status.error{color:#b42318}.result{display:none;margin-top:12px;padding:13px;border:1px solid var(--border);border-radius:6px;background:var(--soft)}.result.visible{display:block}.result-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:8px}.result-label{font-size:12px;color:var(--muted);font-weight:800}.copy{border:1px solid var(--border);border-radius:5px;background:var(--surface);color:var(--text);font:inherit;font-size:12px;font-weight:800;padding:6px 9px;cursor:pointer}.result-text{font-family:\"Noto Sans Armenian\",Nunito,Arial,sans-serif;white-space:pre-wrap;overflow-wrap:anywhere;font-size:16px;line-height:1.65}.footer{margin-top:12px;text-align:right;color:var(--muted);font-size:11px}.hidden{display:none!important}",
    "@media(max-width:560px){.tun-widget{padding:13px}.controls{grid-template-columns:1fr}.swap{width:42px;justify-self:center;transform:rotate(90deg)}.actions{align-items:stretch;flex-direction:column}.translate{width:100%}.header{align-items:flex-start;flex-direction:column}}",
    "@media(prefers-reduced-motion:reduce){*{scroll-behavior:auto!important;transition:none!important}}"
  ].join("");
  root.appendChild(style);

  var widget = element("section", "tun-widget");
  widget.setAttribute("aria-label", "Tun Western Armenian translator");
  var header = element("div", "header");
  header.appendChild(element("div", "title", "Western Armenian Translator"));
  var headerBrand = element("div", configuredBranding ? "brand" : "brand hidden", "Tun");
  header.appendChild(headerBrand);
  widget.appendChild(header);

  var controls = element("div", "controls");
  var sourceField = element("div", "field");
  var sourceLabel = element("label", "", "From");
  sourceLabel.setAttribute("for", containerId + "-source");
  var sourceSelect = document.createElement("select");
  sourceSelect.id = containerId + "-source";
  sourceSelect.setAttribute("aria-label", "Source language");
  ["en", "hyw", "hye"].forEach(function (code) {
    var option = document.createElement("option");
    option.value = code;
    option.textContent = languageNames[code];
    sourceSelect.appendChild(option);
  });
  sourceField.appendChild(sourceLabel);
  sourceField.appendChild(sourceSelect);

  var swapButton = element("button", "swap", "⇄");
  swapButton.type = "button";
  swapButton.setAttribute("aria-label", "Swap translation direction");

  var targetField = element("div", "field");
  var targetLabel = element("label", "", "To");
  targetLabel.setAttribute("for", containerId + "-target");
  var targetSelect = document.createElement("select");
  targetSelect.id = containerId + "-target";
  targetSelect.setAttribute("aria-label", "Target language");
  targetField.appendChild(targetLabel);
  targetField.appendChild(targetSelect);
  controls.appendChild(sourceField);
  controls.appendChild(swapButton);
  controls.appendChild(targetField);
  widget.appendChild(controls);

  var input = document.createElement("textarea");
  input.className = "input";
  input.maxLength = 10000;
  input.placeholder = "Enter text to translate";
  input.setAttribute("aria-label", "Text to translate");
  widget.appendChild(input);

  var actions = element("div", "actions");
  var count = element("span", "count", "0 characters");
  var translateButton = element("button", "translate", "Translate");
  translateButton.type = "button";
  actions.appendChild(count);
  actions.appendChild(translateButton);
  widget.appendChild(actions);

  var status = element("div", "status");
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");
  widget.appendChild(status);

  var result = element("div", "result");
  var resultHead = element("div", "result-head");
  resultHead.appendChild(element("span", "result-label", "Translation"));
  var copyButton = element("button", "copy", "Copy");
  copyButton.type = "button";
  resultHead.appendChild(copyButton);
  var resultText = element("div", "result-text");
  resultText.setAttribute("dir", "auto");
  result.appendChild(resultHead);
  result.appendChild(resultText);
  widget.appendChild(result);

  var footer = element("div", configuredBranding ? "footer" : "footer hidden", "Powered by Tun");
  widget.appendChild(footer);
  root.appendChild(widget);

  function applyTheme() {
    var dark = configuredTheme === "dark" || (configuredTheme === "auto" && window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches);
    widget.classList.toggle("dark", dark);
  }

  function refreshTargets(preferred) {
    var source = sourceSelect.value;
    while (targetSelect.firstChild) targetSelect.removeChild(targetSelect.firstChild);
    allowedTargets[source].forEach(function (code) {
      var option = document.createElement("option");
      option.value = code;
      option.textContent = languageNames[code];
      targetSelect.appendChild(option);
    });
    if (allowedTargets[source].indexOf(preferred) >= 0) targetSelect.value = preferred;
  }

  sourceSelect.value = Object.prototype.hasOwnProperty.call(allowedTargets, configuredSource) ? configuredSource : "en";
  refreshTargets(configuredTarget);
  applyTheme();
  if (configuredTheme === "auto" && window.matchMedia) {
    var media = window.matchMedia("(prefers-color-scheme: dark)");
    if (media.addEventListener) media.addEventListener("change", applyTheme);
  }

  function setBrandingVisible(visible) {
    headerBrand.classList.toggle("hidden", !visible);
    footer.classList.toggle("hidden", !visible);
  }

  function loadServerConfiguration() {
    var configUrl = endpoint.replace(/\/+$/u, "") + "?widget_key=" + encodeURIComponent(widgetKey);
    fetch(configUrl, { method: "GET", headers: { "apikey": publishableKey }, cache: "no-store" })
      .then(function (response) {
        return response.json().catch(function () { return {}; }).then(function (data) { return { response: response, data: data }; });
      })
      .then(function (value) {
        if (!value.response.ok || !value.data.success || !value.data.config) return;
        setBrandingVisible(value.data.config.showBranding !== false);
      })
      .catch(function () {
        setBrandingVisible(true);
      });
  }

  loadServerConfiguration();

  sourceSelect.addEventListener("change", function () { refreshTargets(""); });
  swapButton.addEventListener("click", function () {
    var source = sourceSelect.value;
    var target = targetSelect.value;
    if (source === "en" && target === "hyw") sourceSelect.value = "hyw";
    else sourceSelect.value = "en";
    refreshTargets(source === "hyw" ? "hyw" : "en");
  });
  input.addEventListener("input", function () {
    count.textContent = Array.from(input.value).length.toLocaleString() + " characters";
  });
  input.addEventListener("keydown", function (event) {
    if ((event.ctrlKey || event.metaKey) && event.key === "Enter") translateButton.click();
  });

  copyButton.addEventListener("click", function () {
    var text = resultText.textContent || "";
    if (!text) return;
    navigator.clipboard.writeText(text).then(function () {
      copyButton.textContent = "Copied";
      window.setTimeout(function () { copyButton.textContent = "Copy"; }, 1500);
    }).catch(function () {
      status.className = "status error";
      status.textContent = "Copy failed. Select the translation and copy it manually.";
    });
  });

  translateButton.addEventListener("click", function () {
    var text = input.value.trim();
    if (!text) {
      status.className = "status error";
      status.textContent = "Enter text to translate.";
      input.focus();
      return;
    }
    translateButton.disabled = true;
    translateButton.textContent = "Translating…";
    status.className = "status";
    status.textContent = "Translating…";
    result.classList.remove("visible");

    var url = endpoint.replace(/\/+$/u, "") + "?widget_key=" + encodeURIComponent(widgetKey);
    var controller = typeof AbortController === "function" ? new AbortController() : null;
    var timeoutId = window.setTimeout(function () { if (controller) controller.abort(); }, 40000);
    fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "apikey": publishableKey },
      body: JSON.stringify({ text: input.value, sourceLanguage: sourceSelect.value, targetLanguage: targetSelect.value }),
      cache: "no-store",
      signal: controller ? controller.signal : undefined
    }).then(function (response) {
      return response.json().catch(function () { return {}; }).then(function (data) { return { response: response, data: data }; });
    }).then(function (resultValue) {
      if (!resultValue.response.ok || !resultValue.data.success) throw new Error(resultValue.data.error || "This widget is not authorized for this domain or is temporarily unavailable.");
      resultText.textContent = resultValue.data.translation || "";
      result.classList.add("visible");
      status.textContent = "Translation complete.";
      setBrandingVisible(resultValue.data.showBranding !== false);
    }).catch(function (error) {
      status.className = "status error";
      status.textContent = error && error.name === "AbortError"
        ? "The translation took too long. Please try a shorter passage."
        : error && error.message ? error.message : "This widget is not authorized for this domain or is temporarily unavailable.";
    }).finally(function () {
      window.clearTimeout(timeoutId);
      translateButton.disabled = false;
      translateButton.textContent = "Translate";
    });
  });
}());
