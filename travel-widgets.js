(function () {
  function mountWidget(widget) {
    if (widget.dataset.widgetLoaded === "true") return;

    var template = widget.querySelector("template");
    var mount = widget.querySelector(".travel-widget-mount");
    if (!template || !mount) return;

    var sourceScript = template.content.querySelector("script[src]");
    if (!sourceScript) return;

    var script = document.createElement("script");
    script.async = true;
    script.src = sourceScript.getAttribute("src");
    script.charset = sourceScript.getAttribute("charset") || "utf-8";

    mount.appendChild(script);
    widget.dataset.widgetLoaded = "true";
  }

  function mountTravelpayoutsWidgets() {
    document.querySelectorAll("[data-travelpayouts-widget]").forEach(mountWidget);
  }

  if (document.readyState === "complete") {
    mountTravelpayoutsWidgets();
  } else {
    window.addEventListener("load", mountTravelpayoutsWidgets);
  }
})();
