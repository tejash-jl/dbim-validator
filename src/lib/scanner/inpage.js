// Runs inside the scanned page. Installs window.__dbim with collection helpers.
// Plain JS on purpose: it is injected as a string so no build helpers leak in.
(function () {
  if (window.__dbim) return;

  var MAX_ELEMENTS = 6000;
  var ICON_FONT_RE = /material\s*(icons|symbols)|font\s*awesome|fontawesome|glyphicons|bootstrap-icons|icomoon|ionicons|feather|remixicon|boxicons|dashicons/i;

  function cssEsc(s) {
    return window.CSS && CSS.escape ? CSS.escape(s) : s.replace(/[^a-zA-Z0-9_-]/g, "\\$&");
  }

  function selectorOf(el) {
    if (!el || el.nodeType !== 1) return "";
    var parts = [];
    var cur = el;
    for (var depth = 0; cur && cur.nodeType === 1 && depth < 4; depth++) {
      var part = cur.tagName.toLowerCase();
      if (cur.id && /^[A-Za-z][\w-]*$/.test(cur.id)) {
        parts.unshift(part + "#" + cssEsc(cur.id));
        break;
      }
      var cls = (typeof cur.className === "string" ? cur.className : "")
        .trim()
        .split(/\s+/)
        .filter(function (c) { return c && /^[A-Za-z_-][\w-]*$/.test(c) && c.length < 40; })
        .slice(0, 2);
      if (cls.length) part += "." + cls.map(cssEsc).join(".");
      var parent = cur.parentElement;
      if (parent) {
        var same = Array.prototype.filter.call(parent.children, function (c) { return c.tagName === cur.tagName; });
        if (same.length > 1) part += ":nth-of-type(" + (same.indexOf(cur) + 1) + ")";
      }
      parts.unshift(part);
      cur = parent;
    }
    return parts.join(" > ");
  }

  function parseRgba(s) {
    var m = s && s.match(/rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)/);
    if (!m) return null;
    var a = 1;
    if (m[4] !== undefined) a = m[4].indexOf("%") >= 0 ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
    return { r: +m[1], g: +m[2], b: +m[3], a: a };
  }
  function rgbStr(c) {
    return "rgb(" + Math.round(c.r) + ", " + Math.round(c.g) + ", " + Math.round(c.b) + ")";
  }

  function effectiveBg(el) {
    var layers = [];
    var cur = el;
    while (cur && cur.nodeType === 1) {
      var c = parseRgba(getComputedStyle(cur).backgroundColor);
      if (c && c.a > 0) {
        layers.push(c);
        if (c.a >= 0.99) break;
      }
      cur = cur.parentElement;
    }
    var out = { r: 255, g: 255, b: 255, a: 1 };
    for (var i = layers.length - 1; i >= 0; i--) {
      var f = layers[i];
      out = { r: f.r * f.a + out.r * (1 - f.a), g: f.g * f.a + out.g * (1 - f.a), b: f.b * f.a + out.b * (1 - f.a), a: 1 };
    }
    return rgbStr(out);
  }

  function isVisible(el, cs) {
    cs = cs || getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden" || parseFloat(cs.opacity) === 0) return false;
    var r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  }

  function docRect(el) {
    var r = el.getBoundingClientRect();
    return { x: r.left + scrollX, y: r.top + scrollY, w: r.width, h: r.height, right: r.right, bottom: r.bottom, top: r.top, left: r.left };
  }

  function textOf(el) {
    return ((el.innerText || el.textContent || "") + "").replace(/\s+/g, " ").trim();
  }

  function labelOf(el) {
    return (
      textOf(el) ||
      el.getAttribute("aria-label") ||
      el.getAttribute("title") ||
      (el.querySelector && el.querySelector("img[alt]") ? el.querySelector("img[alt]").getAttribute("alt") : "") ||
      ""
    ).trim();
  }

  // ---------- Header / footer zones ----------

  function findHeader() {
    var cands = Array.prototype.slice.call(
      document.querySelectorAll('header, [role="banner"], [id*="header" i], [class*="header" i], #top, .top-bar, .topbar'),
    );
    cands = cands.filter(function (el) {
      if (el.closest('footer, [role="contentinfo"]')) return false;
      var r = docRect(el);
      return r.y < 500 && r.h > 20 && r.h < 900 && r.w > innerWidth * 0.5 && isVisible(el);
    });
    // outermost
    cands = cands.filter(function (el) {
      return !cands.some(function (o) { return o !== el && o.contains(el); });
    });
    var bottom = 0;
    cands.forEach(function (el) {
      var r = docRect(el);
      bottom = Math.max(bottom, r.y + r.h);
    });
    // Navigation directly below the header belongs to the header zone too.
    Array.prototype.forEach.call(document.querySelectorAll('nav, [role="navigation"]'), function (n) {
      var r = docRect(n);
      if (r.y < Math.max(bottom, 250) + 80 && r.y < 800 && r.h < 400 && isVisible(n)) bottom = Math.max(bottom, r.y + r.h);
    });
    if (!bottom) bottom = 220;
    bottom = Math.min(bottom, 800);
    var main = cands.sort(function (a, b) { return docRect(b).h * docRect(b).w - docRect(a).h * docRect(a).w; })[0] || null;
    return { el: main, all: cands, bottom: bottom };
  }

  function findFooter() {
    var docH = document.documentElement.scrollHeight;
    var cands = Array.prototype.slice.call(
      document.querySelectorAll('footer, [role="contentinfo"], [id*="footer" i], [class*="footer" i]'),
    ).filter(function (el) {
      var r = docRect(el);
      return r.h > 30 && r.w > innerWidth * 0.5 && r.y > docH * 0.3 && isVisible(el);
    });
    cands = cands.filter(function (el) {
      return !cands.some(function (o) { return o !== el && o.contains(el); });
    });
    if (!cands.length) return { el: null, top: Infinity };
    // When several outer candidates exist (e.g. footer carousel + footer), the footer zone starts at the first.
    cands.sort(function (a, b) { return docRect(a).y - docRect(b).y; });
    var top = docRect(cands[0]).y;
    var largest = cands.slice().sort(function (a, b) { return docRect(b).h - docRect(a).h; })[0];
    return { el: largest, all: cands, top: top };
  }

  function dominantBg(root) {
    var weights = {};
    var rootR = root.getBoundingClientRect();
    var rootArea = rootR.width * rootR.height;
    var els = [root].concat(Array.prototype.slice.call(root.querySelectorAll("*"), 0, 1500));
    els.forEach(function (el) {
      var cs = getComputedStyle(el);
      var c = parseRgba(cs.backgroundColor);
      if (!c || c.a < 0.9) return;
      var r = el.getBoundingClientRect();
      var area = Math.min(r.width * r.height, rootArea);
      if (area <= 0) return;
      var key = rgbStr(c);
      // Children paint over parents: subtract area from the closest painted ancestor.
      weights[key] = (weights[key] || 0) + area;
      var p = el.parentElement;
      while (p && root.contains(p)) {
        var pc = parseRgba(getComputedStyle(p).backgroundColor);
        if (pc && pc.a >= 0.9) {
          var pk = rgbStr(pc);
          weights[pk] = (weights[pk] || 0) - area;
          break;
        }
        p = p.parentElement;
      }
    });
    var best = null, bw = -1;
    Object.keys(weights).forEach(function (k) {
      if (weights[k] > bw) { bw = weights[k]; best = k; }
    });
    return best || effectiveBg(root);
  }

  // ---------- Main collection for the current viewport ----------

  function collectViewport() {
    var header = findHeader();
    var footer = findFooter();
    function inHeader(el) {
      if (header.all.some(function (h) { return h.contains(el); })) return true;
      var r = docRect(el);
      return r.y + r.h / 2 < header.bottom;
    }
    function inFooter(el) {
      if (footer.el && footer.all.some(function (f) { return f.contains(el); })) return true;
      return docRect(el).y >= footer.top;
    }

    var all = Array.prototype.slice.call(document.body ? document.body.querySelectorAll("*") : [], 0, MAX_ELEMENTS);
    var docArea = Math.max(1, document.documentElement.scrollWidth * document.documentElement.scrollHeight);
    var colors = [];
    var texts = [];
    var skipTags = { SCRIPT: 1, STYLE: 1, NOSCRIPT: 1, TEMPLATE: 1, SVG: 1, PATH: 1, META: 1, LINK: 1, BR: 1 };

    all.forEach(function (el) {
      if (skipTags[el.tagName.toUpperCase()]) return;
      var cs = getComputedStyle(el);
      if (!isVisible(el, cs)) return;
      var r = el.getBoundingClientRect();
      var area = Math.min(r.width, document.documentElement.scrollWidth) * r.height;

      var bg = parseRgba(cs.backgroundColor);
      if (bg && bg.a > 0.05) colors.push({ color: cs.backgroundColor, weight: area / docArea, prop: "bg" });
      if (cs.backgroundImage && cs.backgroundImage.indexOf("gradient") >= 0) {
        var found = cs.backgroundImage.match(/rgba?\([^)]+\)/g) || [];
        found.forEach(function (c) { colors.push({ color: c, weight: area / docArea / found.length, prop: "gradient" }); });
      }
      var bw = parseFloat(cs.borderTopWidth) + parseFloat(cs.borderBottomWidth) + parseFloat(cs.borderLeftWidth) + parseFloat(cs.borderRightWidth);
      if (bw > 0 && cs.borderTopStyle !== "none") {
        colors.push({ color: cs.borderTopColor, weight: ((r.width + r.height) * 2 * (bw / 4)) / docArea, prop: "border" });
      }

      var direct = "";
      for (var i = 0; i < el.childNodes.length; i++) {
        var n = el.childNodes[i];
        if (n.nodeType === 3) direct += n.textContent;
      }
      direct = direct.replace(/\s+/g, " ").trim();
      if (direct.length > 1 && texts.length < 4000 && !ICON_FONT_RE.test(cs.fontFamily)) {
        var fs = parseFloat(cs.fontSize);
        colors.push({ color: cs.color, weight: (direct.length * fs * fs * 0.5) / docArea, prop: "text" });
        var lh = cs.lineHeight === "normal" ? null : parseFloat(cs.lineHeight);
        texts.push({
          sel: selectorOf(el),
          tag: el.tagName.toLowerCase(),
          chars: direct.length,
          text: direct.slice(0, 300),
          fontFamily: cs.fontFamily,
          fontSize: fs,
          fontWeight: parseInt(cs.fontWeight, 10) || 400,
          lineHeight: lh,
          color: cs.color,
          bg: effectiveBg(el),
          textAlign: cs.textAlign,
          textTransform: cs.textTransform,
          inHeader: inHeader(el),
          inFooter: inFooter(el),
        });
      }
    });

    var headings = Array.prototype.slice
      .call(document.querySelectorAll('h1, h2, h3, h4, h5, h6, [role="heading"][aria-level]'))
      .filter(function (h) { return isVisible(h) && textOf(h).length > 0; })
      .slice(0, 300)
      .map(function (h) {
        var cs = getComputedStyle(h);
        var level = /^H\d$/.test(h.tagName) ? +h.tagName[1] : +h.getAttribute("aria-level");
        return { level: level, text: textOf(h).slice(0, 160), fontSize: parseFloat(cs.fontSize), fontWeight: parseInt(cs.fontWeight, 10) || 400, fontFamily: cs.fontFamily, inHeader: inHeader(h), inFooter: inFooter(h) };
      });

    return {
      width: innerWidth,
      height: innerHeight,
      scrollWidth: document.documentElement.scrollWidth,
      texts: texts,
      headings: headings,
      colors: colors,
    };
  }

  function collectPage() {
    var header = findHeader();
    var footer = findFooter();
    function inHeader(el) {
      if (header.all.some(function (h) { return h.contains(el); })) return true;
      var r = docRect(el);
      return r.y + r.h / 2 < header.bottom;
    }
    function inFooter(el) {
      if (footer.el && footer.all.some(function (f) { return f.contains(el); })) return true;
      return docRect(el).y >= footer.top;
    }
    if (header.el) header.el.setAttribute("data-dbim", "header");
    if (footer.el) footer.el.setAttribute("data-dbim", "footer");

    // ----- images -----
    var images = [];
    Array.prototype.forEach.call(document.images, function (img) {
      var cs = getComputedStyle(img);
      if (!isVisible(img, cs)) return;
      var r = docRect(img);
      var a = img.closest("a");
      images.push({
        sel: selectorOf(img),
        src: img.currentSrc || img.src,
        alt: img.hasAttribute("alt") ? img.getAttribute("alt") : null,
        role: img.getAttribute("role"),
        ariaHidden: img.getAttribute("aria-hidden") === "true" || !!img.closest('[aria-hidden="true"]'),
        naturalWidth: img.naturalWidth,
        naturalHeight: img.naturalHeight,
        width: r.w,
        height: r.h,
        top: r.y,
        hasDims: img.hasAttribute("width") && img.hasAttribute("height"),
        objectFit: cs.objectFit,
        loading: img.getAttribute("loading"),
        inHeader: inHeader(img),
        inFooter: inFooter(img),
        inLink: !!a,
        linkText: a ? textOf(a).slice(0, 80) : "",
        isBackground: false,
      });
    });
    Array.prototype.slice.call(document.querySelectorAll("body *"), 0, MAX_ELEMENTS).forEach(function (el) {
      var cs = getComputedStyle(el);
      if (!cs.backgroundImage || cs.backgroundImage.indexOf("url(") < 0) return;
      if (!isVisible(el, cs)) return;
      var r = docRect(el);
      if (r.w * r.h < 400) return;
      var m = cs.backgroundImage.match(/url\(["']?([^"')]+)["']?\)/);
      if (!m || m[1].indexOf("data:") === 0) return;
      images.push({
        sel: selectorOf(el), src: new URL(m[1], location.href).href, alt: null, role: null,
        ariaHidden: true, naturalWidth: 0, naturalHeight: 0, width: r.w, height: r.h, top: r.y, hasDims: true, objectFit: "fill",
        loading: null, inHeader: inHeader(el), inFooter: inFooter(el), inLink: !!el.closest("a"), linkText: "", isBackground: true,
      });
    });

    // ----- inline svg icons -----
    var svgs = [];
    Array.prototype.forEach.call(document.querySelectorAll("svg"), function (svg) {
      if (svg.parentElement && svg.parentElement.closest("svg")) return;
      if (!isVisible(svg)) return;
      var r = docRect(svg);
      if (r.w > 128 || r.h > 128) return;
      var cols = {};
      [svg].concat(Array.prototype.slice.call(svg.querySelectorAll("path, circle, rect, polygon, line, polyline, ellipse, g"), 0, 30)).forEach(function (n) {
        var cs = getComputedStyle(n);
        [cs.fill, cs.stroke].forEach(function (c) {
          var p = parseRgba(c);
          if (p && p.a > 0.1) cols[rgbStr(p)] = 1;
        });
      });
      svgs.push({
        sel: selectorOf(svg), width: r.w, height: r.h, colors: Object.keys(cols),
        inHeader: inHeader(svg), inFooter: inFooter(svg),
        label: svg.getAttribute("aria-label") || (svg.closest("a,button") ? labelOf(svg.closest("a,button")) : "") || "",
        hasTitle: !!svg.querySelector("title") || !!svg.getAttribute("aria-label") || !!(svg.closest("[title]")),
      });
    });

    var iconFonts = [];
    Array.prototype.forEach.call(
      document.querySelectorAll('i[class*="fa"], span[class*="fa-"], [class*="icon"], .material-icons, .material-symbols-outlined, [class*="bi-"], .glyphicon'),
      function (el) {
        if (iconFonts.length > 300 || !isVisible(el)) return;
        var before = getComputedStyle(el, "::before");
        var hasGlyph = before && before.content && before.content !== "none" && before.content !== '""' && before.content !== "normal";
        var isLigature = /material/.test(el.className + "");
        if (!hasGlyph && !isLigature) return;
        var r = docRect(el);
        if (r.w > 80 || r.h > 80) return;
        iconFonts.push({ sel: selectorOf(el), size: parseFloat(getComputedStyle(el).fontSize), color: getComputedStyle(el).color });
      },
    );

    // ----- links -----
    var links = [];
    Array.prototype.forEach.call(document.querySelectorAll("a[href]"), function (a) {
      var href = a.getAttribute("href") || "";
      if (/^(javascript:|mailto:|tel:|#)/i.test(href)) return;
      var abs;
      try { abs = new URL(href, location.href).href; } catch { return; }
      links.push({
        href: abs,
        text: labelOf(a).slice(0, 120),
        inHeader: inHeader(a),
        inFooter: inFooter(a),
        inNav: !!a.closest('nav, [role="navigation"], [class*="menu" i]'),
        title: a.getAttribute("title") || "",
      });
    });

    // ----- header -----
    var headerZone = Array.prototype.slice.call(document.querySelectorAll("body *"), 0, MAX_ELEMENTS).filter(function (el) {
      var r = docRect(el);
      return r.y < header.bottom && r.h > 0 && !inFooter(el);
    });
    function zoneMatch(selector, re, opts) {
      return headerZone.filter(function (el) {
        if (selector && !el.matches(selector)) return false;
        if (opts && opts.visibleOnly && !isVisible(el)) return false;
        if (!re) return true;
        var s = [labelOf(el).slice(0, 80), el.getAttribute("aria-label") || "", el.getAttribute("title") || "", el.id || "", typeof el.className === "string" ? el.className : "", el.getAttribute("placeholder") || "", el.getAttribute("name") || ""].join(" ");
        return re.test(s);
      });
    }
    var searchInputs = zoneMatch('input[type="search"], input[type="text"], input:not([type])', /search|खोज|\bq\b|query|keyword/i);
    searchInputs = searchInputs.concat(zoneMatch('input[type="search"]', null));
    var searchToggles = zoneMatch('button, a, [role="button"], i, span', /search|खोज/i);
    var searchVisible = searchInputs.filter(function (i) { return isVisible(i); });
    var skipRe = /skip\s*to|skip\s*(main|content|navigation)|main\s*content|मुख्य\s*सामग्री|सामग्री\s*पर\s*जाएं|सीधे\s*मुख्य/i;
    var skip = Array.prototype.slice.call(document.querySelectorAll('a[href^="#"], a[href*="#main"], a[href*="#content"], button, [role="button"], [role="link"]')).filter(function (a) {
      return skipRe.test(textOf(a).slice(0, 80) + " " + (a.getAttribute("aria-label") || "") + " " + (a.getAttribute("title") || "") + " " + (a.getAttribute("data-bs-original-title") || ""));
    });
    var skipTarget = skip.some(function (a) {
      if (a.tagName !== "A") return !!document.querySelector("main, #main, #maincontent, #main-content, #content, [role='main']");
      var id = (a.getAttribute("href") || "").split("#")[1] || "";
      return id && (document.getElementById(id) || document.getElementsByName(id).length);
    });
    var langRe = /हिन्दी|हिंदी|\bhindi\b|\benglish\b|language|भाषा|^\s*अ\s*[|/]?\s*a\s*$|^\s*a\s*[|/]?\s*अ\s*$|translate|lang/i;
    var langSwitch =
      zoneMatch("a, button, select, option, [role='button'], li, span, div", langRe).filter(function (el) {
        return el.children.length < 8;
      }).length > 0 ||
      !!document.querySelector("#google_translate_element, .goog-te-combo, a[hreflang], [class*='lang' i] select, select[name*='lang' i]");
    var a11yRe = /accessib|screen\s*reader|\ba\s*\+|\ba\s*-|\ba\+|\ba-|font\s*size|text\s*size|contrast|dark\s*mode|सुगम्यता|स्क्रीन\s*रीडर|text-?resize|increase|decrease/i;
    var a11y = zoneMatch("a, button, [role='button'], li, span, div, img", a11yRe).filter(function (el) { return el.children.length < 8; });
    var navs = headerZone.filter(function (el) { return el.matches('nav, [role="navigation"], ul[class*="menu" i], ul[class*="nav" i], [id*="menu" i] > ul'); });
    var bestNav = null, bestCount = 0;
    navs.forEach(function (n) {
      var c = n.querySelectorAll("a").length;
      if (c > bestCount) { bestCount = c; bestNav = n; }
    });
    var navItems = [];
    if (bestNav) {
      var ul = bestNav.matches("ul") ? bestNav : bestNav.querySelector("ul");
      var tops = ul ? Array.prototype.filter.call(ul.children, function (c) { return c.tagName === "LI"; }) : Array.prototype.slice.call(bestNav.querySelectorAll("a"));
      tops.forEach(function (li) {
        var a = li.matches("a") ? li : li.querySelector("a, button, span");
        var t = a ? labelOf(a) : textOf(li);
        t = (t || "").split(/\n/)[0].replace(/\b(expand_(more|less)|keyboard_arrow_\w+|arrow_drop_\w+|arrow_\w+|chevron_\w+|navigate_next|add|remove)\b/g, "").replace(/\s+/g, " ").trim().slice(0, 60);
        if (t) navItems.push(t);
      });
    }
    var emblemRe = /emblem|ashok|satyamev|national[-_ ]?emblem|state[-_ ]?emblem|goi[-_ ]?logo|lion[-_ ]?capital|राष्ट्रीय\s*प्रतीक|सत्यमेव/i;
    function imgInfo(el) {
      var r = docRect(el);
      var src = el.currentSrc || el.src || (el.tagName === "svg" ? "inline-svg" : "");
      return {
        src: /^data:/.test(src) ? src.slice(0, src.indexOf(",") + 1) + "…" : src,
        detectedBy: el.__dbimEmblemBy || undefined,
        alt: el.getAttribute("alt") || el.getAttribute("aria-label") || el.getAttribute("title") || "",
        width: r.w, height: r.h,
        naturalWidth: el.naturalWidth || 0, naturalHeight: el.naturalHeight || 0,
        objectFit: getComputedStyle(el).objectFit,
      };
    }
    var headerImgs = headerZone.filter(function (el) { return (el.tagName === "IMG" || el.tagName === "svg") && isVisible(el); });
    // Context that names the emblem or the Government of India on a wrapper (e.g. <button class="India-logo-container">).
    var emblemContextRe = /emblem|ashok|satyamev|\bindia\b|india[-_]|goi\b|gov(t|ernment)?[-_ ]?of[-_ ]?india|bharat|भारत\s*सरकार|सत्यमेव/i;
    var emblemTextRe = /government\s+of\s+india|govt\.?\s+of\s+india|भारत\s*सरकार|satyamev[a]?\s+jayate|सत्यमेव\s+जयते/i;
    // The State Emblem is a portrait mark (about 3:5) and usually drawn in a single colour.
    function emblemShaped(el) {
      var r = docRect(el);
      var w = el.naturalWidth || r.w, h = el.naturalHeight || r.h;
      return r.h >= 20 && r.h <= 160 && h > 0 && w / h >= 0.45 && w / h <= 0.8;
    }
    function monochrome(el) {
      if (el.tagName !== "IMG" || !el.complete || !el.naturalWidth) return false;
      try {
        var c = document.createElement("canvas");
        c.width = 40; c.height = Math.max(1, Math.round(40 * el.naturalHeight / el.naturalWidth));
        var ctx = c.getContext("2d");
        ctx.drawImage(el, 0, 0, c.width, c.height);
        var d = ctx.getImageData(0, 0, c.width, c.height).data; // throws for cross-origin images
        var n = 0, flat = 0, transparent = 0;
        for (var i = 0; i < d.length; i += 4) {
          if (d[i + 3] < 128) { transparent++; continue; }
          n++;
          var mx = Math.max(d[i], d[i + 1], d[i + 2]), mn = Math.min(d[i], d[i + 1], d[i + 2]);
          if (mx - mn < 40) flat++;
        }
        // A line-art mark on a transparent background, in black, white or grey.
        return n > 20 && transparent / (d.length / 4) > 0.2 && flat / n > 0.9;
      } catch { return false; }
    }
    function emblemContext(el) {
      var a = el.parentElement;
      for (var i = 0; a && i < 3 && a !== document.body; i++, a = a.parentElement) {
        var s = [a.getAttribute("class") || "", a.id || "", a.getAttribute("aria-label") || "", a.getAttribute("title") || ""].join(" ");
        if (emblemContextRe.test(s) || emblemTextRe.test(textOf(a).slice(0, 300))) return true;
      }
      return false;
    }
    var headerRect = header.el ? docRect(header.el) : { x: 0, w: innerWidth };
    var emblems = headerImgs.filter(function (el) {
      var s = [el.currentSrc || el.src || "", el.getAttribute("alt") || "", el.getAttribute("class") || "", el.getAttribute("title") || "", el.getAttribute("aria-label") || ""].join(" ");
      if (emblemRe.test(s)) { el.__dbimEmblemBy = "name"; return true; }
      // Unnamed images: a portrait mark at the start of the header with Government of India context, or drawn as single-colour line art.
      if (!emblemShaped(el) || docRect(el).x > headerRect.x + headerRect.w * 0.4) return false;
      if (emblemContext(el)) { el.__dbimEmblemBy = "shape and Government of India context"; return true; }
      if (monochrome(el)) { el.__dbimEmblemBy = "shape and single-colour line art"; return true; }
      return false;
    });
    if (!emblems.length)
      headerImgs.filter(function (el) { var r = docRect(el); return el.tagName === "IMG" && r.h >= 30 && r.w >= 30; }).slice(0, 8).some(function (el) {
        if (!emblemInLockup(el).found) return false;
        el.__dbimEmblemBy = "a portrait mark inside the logo image";
        emblems.push(el);
        return true;
      });
    var logos = headerImgs.filter(function (el) {
      if (emblems.indexOf(el) >= 0) return false;
      var s = [el.currentSrc || el.src || "", el.getAttribute("alt") || "", el.getAttribute("class") || "", el.id || ""].join(" ");
      var r = docRect(el);
      return /logo|brand/i.test(s) || (r.w >= 40 && r.h >= 30 && r.y < 250 && !!el.closest('a[href="/"], a[href="./"], a[href*="index"], a[href="' + location.origin + '/"]'));
    });
    var headerText = header.el ? textOf(header.el) : headerZone.slice(0, 200).map(textOf).join(" ").slice(0, 2000);

    // ----- footer -----
    var footerLinks = links.filter(function (l) { return l.inFooter; }).map(function (l) { return { text: l.text, href: l.href }; });

    // ----- forms -----
    var forms = [];
    var formRoots = Array.prototype.slice.call(document.querySelectorAll("form"));
    formRoots.forEach(function (f) {
      if (!isVisible(f)) return;
      var fields = Array.prototype.slice.call(f.querySelectorAll('input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="reset"]):not([type="image"]), select, textarea')).filter(function (i) { return isVisible(i); });
      if (!fields.length) return;
      var isSearch = fields.length <= 2 && fields.some(function (i) { return /search|\bq\b|query|खोज/i.test((i.name || "") + " " + (i.placeholder || "") + " " + (i.getAttribute("aria-label") || "") + " " + i.type); });
      if (isSearch) return;
      var isFilter = f.getAttribute("role") === "search" || fields.some(function (i) { return /search|filter|sort|खोज/i.test((i.name || "") + " " + (i.placeholder || "") + " " + (i.getAttribute("aria-label") || "") + " " + (i.className + "")); }) || fields.every(function (i) { return i.tagName === "SELECT"; });
      var intro = "";
      var walker = document.createTreeWalker(f, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
      var node;
      while ((node = walker.nextNode())) {
        if (node.nodeType === 1 && /^(INPUT|SELECT|TEXTAREA|LABEL)$/.test(node.tagName)) break;
        if (node.nodeType === 3) intro += node.textContent;
      }
      forms.push({
        sel: selectorOf(f),
        isFilter: isFilter,
        introText: intro.replace(/\s+/g, " ").trim().slice(0, 300),
        fields: fields.map(function (i) {
          var forLabel = i.id ? document.querySelector('label[for="' + cssEsc(i.id) + '"]') : null;
          var wrap = i.closest("label");
          var lab = forLabel || wrap;
          var labelText = lab ? textOf(lab) : "";
          var ariaLab = i.getAttribute("aria-label") || (i.getAttribute("aria-labelledby") ? textOf(document.getElementById(i.getAttribute("aria-labelledby")) || document.createElement("x")) : "");
          var required = i.required || i.getAttribute("aria-required") === "true";
          return {
            sel: selectorOf(i),
            type: i.type || i.tagName.toLowerCase(),
            labelled: !!(labelText || ariaLab || i.getAttribute("title")),
            clickableLabel: !!lab,
            required: required,
            requiredMarked: !required || /\*|required|आवश्यक|अनिवार्य/i.test(labelText + " " + ariaLab + " " + (lab && lab.parentElement ? textOf(lab.parentElement).slice(0, 120) : "")),
          };
        }),
      });
    });

    // ----- buttons -----
    var buttons = [];
    Array.prototype.forEach.call(document.querySelectorAll('button, input[type="submit"], input[type="button"], a.btn, a[class*="button" i], [role="button"]'), function (b) {
      if (buttons.length > 200 || !isVisible(b)) return;
      var cs = getComputedStyle(b);
      var t = labelOf(b);
      if (!t || t.length > 40) return;
      var bg = parseRgba(cs.backgroundColor);
      if (!bg || bg.a < 0.5) return; // only filled buttons count as CTA buttons
      var r = b.getBoundingClientRect();
      buttons.push({ text: t, height: Math.round(r.height), paddingX: Math.round(parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight)), fontSize: parseFloat(cs.fontSize), bg: cs.backgroundColor });
    });

    // ----- tables -----
    var tables = [];
    Array.prototype.slice.call(document.querySelectorAll("table"), 0, 20).forEach(function (t) {
      if (!isVisible(t)) return;
      var ths = Array.prototype.slice.call(t.querySelectorAll("th"), 0, 20);
      if (!ths.length) return;
      var nums = Array.prototype.slice.call(t.querySelectorAll("td"), 0, 200).filter(function (td) {
        var s = textOf(td);
        return s.length > 0 && /^[₹$]?\s*[\d,.]+\s*(%|cr|lakh|crore)?$/i.test(s);
      });
      tables.push({
        headerAlign: ths.map(function (th) { return getComputedStyle(th).textAlign; }),
        numericCellAlign: nums.slice(0, 40).map(function (td) { return getComputedStyle(td).textAlign; }),
      });
    });

    // ----- cookie banner -----
    var cookie = { found: false, atBottom: false, hasAccept: false, hasReject: false, hasCustomize: false, text: "" };
    var cookieEls = Array.prototype.slice.call(document.querySelectorAll("body *"), 0, MAX_ELEMENTS).filter(function (el) {
      if (el.children.length > 40) return false;
      var cs = getComputedStyle(el);
      if (cs.position !== "fixed" && cs.position !== "sticky") return false;
      return isVisible(el, cs) && /cookie|कुकी/i.test(textOf(el));
    });
    if (cookieEls.length) {
      var c = cookieEls[0];
      var r = c.getBoundingClientRect();
      var btnText = Array.prototype.map.call(c.querySelectorAll("button, a, [role='button'], input[type='button'], input[type='submit']"), labelOf).join(" | ");
      cookie = {
        found: true,
        atBottom: r.bottom >= innerHeight - 40 || r.top > innerHeight * 0.45,
        hasAccept: /accept|agree|allow|ok\b|got it|स्वीकार|एक्सेप्ट|सहमत/i.test(btnText),
        hasReject: /reject|decline|deny|refuse|necessary only|essential only|अस्वीकार|रिजेक्ट/i.test(btnText),
        hasCustomize: /custom|setting|preference|manage|configure|अनुकूलित|सेटिंग/i.test(btnText + " " + textOf(c).slice(0, 80)),
        text: textOf(c).slice(0, 300),
      };
    }

    // ----- chatbot -----
    var chat = { found: false, bottomRight: false };
    Array.prototype.slice.call(document.querySelectorAll("body *"), 0, MAX_ELEMENTS).some(function (el) {
      var cs = getComputedStyle(el);
      if (cs.position !== "fixed") return false;
      if (!isVisible(el, cs)) return false;
      var s = [el.id, typeof el.className === "string" ? el.className : "", el.getAttribute("aria-label") || "", el.getAttribute("title") || "", el.tagName === "IFRAME" ? el.src : "", textOf(el).slice(0, 60)].join(" ");
      if (!/chat|bot|vaani|assistant|ask\s*me|help\s*desk/i.test(s)) return false;
      var r = el.getBoundingClientRect();
      chat = { found: true, bottomRight: r.right > innerWidth - 200 && r.bottom > innerHeight - 260 };
      return true;
    });

    // ----- videos -----
    var videos = [];
    Array.prototype.forEach.call(document.querySelectorAll("video"), function (v) {
      videos.push({ sel: selectorOf(v), kind: "video", src: v.currentSrc || v.src || "", hasCaptions: !!v.querySelector('track[kind="captions"], track[kind="subtitles"]') });
    });
    Array.prototype.forEach.call(document.querySelectorAll("iframe"), function (f) {
      var src = f.src || f.getAttribute("data-src") || "";
      if (!/youtube|youtu\.be|vimeo|dailymotion/i.test(src)) return;
      videos.push({ sel: selectorOf(f), kind: "iframe", src: src, hasCaptions: /cc_load_policy=1/.test(src) });
    });

    // ----- hover candidates (marked for the driver) -----
    var hoverEls = Array.prototype.slice.call(document.querySelectorAll('main a[href], main button, a.btn, button, nav a[href], a[href]')).filter(function (el) {
      var r = el.getBoundingClientRect();
      return isVisible(el) && r.width > 20 && r.height > 10 && r.top >= 0 && r.top < innerHeight * 3;
    });
    var picked = [];
    [hoverEls.filter(function (e) { return e.closest("nav"); }), hoverEls.filter(function (e) { return e.tagName === "BUTTON" || /btn|button/i.test(e.className + ""); }), hoverEls].forEach(function (group) {
      group.slice(0, 4).forEach(function (e) { if (picked.indexOf(e) < 0 && picked.length < 8) picked.push(e); });
    });
    picked.forEach(function (e, i) { e.setAttribute("data-dbim-hover", String(i)); });

    var docLang = document.documentElement.getAttribute("lang");
    var hreflangs = Array.prototype.map.call(document.querySelectorAll('link[rel="alternate"][hreflang]'), function (l) { return l.getAttribute("hreflang"); });
    var vp = document.querySelector('meta[name="viewport"]');
    var desc = document.querySelector('meta[name="description"]');

    return {
      title: document.title,
      lang: docLang,
      hreflangs: hreflangs,
      metaViewport: vp ? vp.getAttribute("content") : null,
      metaDescription: desc ? desc.getAttribute("content") : null,
      bodyText: (document.body ? document.body.innerText : "").slice(0, 120000),
      images: images.slice(0, 400),
      svgs: svgs.slice(0, 300),
      iconFonts: iconFonts,
      links: links.slice(0, 1500),
      forms: forms,
      buttons: buttons,
      tables: tables,
      header: {
        found: !!header.el,
        sel: header.el ? '[data-dbim="header"]' : null,
        text: headerText.slice(0, 2000),
        bg: header.el ? dominantBg(header.el) : effectiveBg(document.body),
        hasSearch: searchInputs.length > 0 || searchToggles.length > 0,
        searchWidth: searchVisible.length ? Math.round(searchVisible[0].getBoundingClientRect().width) : 0,
        hasSkipLink: skip.length > 0,
        skipLinkTarget: !!skipTarget,
        hasLanguageSwitch: !!langSwitch,
        hasAccessibilityControls: a11y.length > 0,
        hasNav: !!bestNav && bestCount >= 3,
        navItems: navItems.slice(0, 20),
        stickyAfterScroll: null,
        emblemCandidates: emblems.slice(0, 5).map(imgInfo),
        logoCandidates: logos.slice(0, 8).map(imgInfo),
        hasLogin: zoneMatch("a, button", /log\s*-?in|sign\s*-?in|register|लॉग\s*इन|पंजीकरण/i).length > 0,
      },
      footer: {
        found: !!footer.el,
        sel: footer.el ? '[data-dbim="footer"]' : null,
        text: footer.el ? footer.all.map(textOf).join(" ").slice(0, 6000) : "",
        bg: footer.el ? dominantBg(footer.el) : "",
        links: footerLinks.slice(0, 300),
      },
      cookieBanner: cookie,
      chatbot: chat,
      videos: videos.slice(0, 50),
    };
  }

  function stickyCheck() {
    var h = document.querySelector('[data-dbim="header"]');
    var navs = Array.prototype.slice.call(document.querySelectorAll('nav, [role="navigation"], [data-dbim="header"] *'));
    var cands = (h ? [h] : []).concat(navs);
    return cands.some(function (el) {
      var cs = getComputedStyle(el);
      if (!isVisible(el, cs)) return false;
      var r = el.getBoundingClientRect();
      return (cs.position === "fixed" || cs.position === "sticky") && r.top <= 5 && r.bottom > 0 && r.height > 30 && r.width > innerWidth * 0.5;
    });
  }

  var HOVER_PROPS = ["color", "backgroundColor", "textDecorationLine", "borderBottomColor", "borderTopColor", "boxShadow", "opacity", "transform", "outlineStyle", "fontWeight", "backgroundImage", "filter"];
  function hoverStyles(i) {
    var el = document.querySelector('[data-dbim-hover="' + i + '"]');
    if (!el) return null;
    var out = {};
    var targets = [el].concat(Array.prototype.slice.call(el.querySelectorAll("*"), 0, 5));
    targets.forEach(function (t, k) {
      var cs = getComputedStyle(t);
      HOVER_PROPS.forEach(function (p) { out[k + ":" + p] = cs[p]; });
      var after = getComputedStyle(t, "::after");
      out[k + ":after"] = after.width + after.transform + after.backgroundColor + after.opacity;
      var before = getComputedStyle(t, "::before");
      out[k + ":before"] = before.width + before.transform + before.backgroundColor + before.opacity;
    });
    return { sel: selectorOf(el), styles: out };
  }

  function perf() {
    return new Promise(function (resolve) {
      var lcp = null, cls = 0;
      try {
        new PerformanceObserver(function (l) {
          l.getEntries().forEach(function (e) { lcp = e.renderTime || e.loadTime || e.startTime; });
        }).observe({ type: "largest-contentful-paint", buffered: true });
      } catch {}
      try {
        new PerformanceObserver(function (l) {
          l.getEntries().forEach(function (e) { if (!e.hadRecentInput) cls += e.value; });
        }).observe({ type: "layout-shift", buffered: true });
      } catch {}
      setTimeout(function () {
        var nav = performance.getEntriesByType("navigation")[0];
        var transfer = performance.getEntriesByType("resource").reduce(function (s, r) { return s + (r.transferSize || 0); }, nav ? nav.transferSize || 0 : 0);
        resolve({
          ttfb: nav ? Math.round(nav.responseStart) : null,
          domContentLoaded: nav ? Math.round(nav.domContentLoadedEventEnd) : null,
          load: nav ? Math.round(nav.loadEventEnd) : null,
          lcp: lcp === null ? null : Math.round(lcp),
          cls: Math.round(cls * 1000) / 1000,
          transferBytes: transfer,
        });
      }, 300);
    });
  }

  function findSearchInput() {
    var header = findHeader();
    var inputs = Array.prototype.slice.call(document.querySelectorAll('input[type="search"], input[type="text"], input:not([type])')).filter(function (i) {
      var s = (i.name || "") + " " + (i.placeholder || "") + " " + (i.getAttribute("aria-label") || "") + " " + (i.id || "") + " " + i.type;
      return /search|खोज|\bq\b|query|keyword/i.test(s) && docRect(i).y < Math.max(header.bottom, 300) + 200;
    });
    var visible = inputs.filter(function (i) { return isVisible(i); });
    if (visible.length) {
      visible[0].setAttribute("data-dbim-search", "input");
      return "input";
    }
    var toggles = Array.prototype.slice.call(document.querySelectorAll('button, a, [role="button"]')).filter(function (b) {
      var s = labelOf(b) + " " + (b.className + "") + " " + (b.id || "");
      return isVisible(b) && /search|खोज/i.test(s) && docRect(b).y < header.bottom + 100;
    });
    if (toggles.length) {
      toggles[0].setAttribute("data-dbim-search", "toggle");
      if (inputs.length) inputs[0].setAttribute("data-dbim-search", "input");
      return "toggle";
    }
    return null;
  }

  // ----- State Emblem inside a combined logo image -----
  function readPixels(el) {
    if (el.tagName !== "IMG" || !el.complete || !el.naturalWidth || !el.naturalHeight) return null;
    try {
      var nw = el.naturalWidth, nh = el.naturalHeight;
      // Enough resolution for the emblem's detail: about 160px tall, at most 1600px wide.
      var scale = Math.min(1, 160 / nh, 1600 / nw);
      if (nw * scale < 120) scale = Math.min(1, 120 / nw);
      var w = Math.max(1, Math.round(nw * scale)), h = Math.max(1, Math.round(nh * scale));
      var c = document.createElement("canvas");
      c.width = w; c.height = h;
      var ctx = c.getContext("2d");
      ctx.drawImage(el, 0, 0, w, h);
      return { w: w, h: h, d: ctx.getImageData(0, 0, w, h).data }; // throws for cross-origin images
    } catch { return null; }
  }

  // Runs of true values, joining gaps of up to `gap` entries.
  function runs(arr, gap) {
    var out = [], start = -1, last = -1;
    for (var i = 0; i < arr.length; i++) {
      if (!arr[i]) continue;
      if (start < 0) start = i;
      else if (i - last > gap + 1) { out.push([start, last]); start = i; }
      last = i;
    }
    if (start >= 0) out.push([start, last]);
    return out;
  }

  // Looks for the State Emblem drawn inside a logo image: the only mark in the top row of a stacked lockup
  // (india.gov.in's npi_logo.svg), or a mark at either end of a side-by-side lockup or banner (ISRO). The emblem is a
  // portrait, single-colour mark with fine detail (lions, abacus, wheel), which tells it apart from letters.
  function emblemInLockup(el) {
    var px = readPixels(el);
    if (!px) return { found: false, why: "pixels not readable" };
    var w = px.w, h = px.h, d = px.d;
    var br = d[0], bgc = d[1], bb = d[2], ba = d[3]; // background = top-left pixel
    var ink = new Uint8Array(w * h), x, y, i, k;
    for (i = 0, k = 0; i < d.length; i += 4, k++) {
      if (d[i + 3] < 160) continue;
      if (ba >= 128 && Math.abs(d[i] - br) + Math.abs(d[i + 1] - bgc) + Math.abs(d[i + 2] - bb) < 60) continue;
      ink[k] = 1;
    }
    function box(x0, x1, y0, y1) {
      var rows = [], cols = [];
      for (var yy = y0; yy <= y1; yy++) for (var xx = x0; xx <= x1; xx++) if (ink[yy * w + xx]) { rows[yy - y0] = true; cols[xx - x0] = true; }
      var r = runs(rows, 0), c = runs(cols, 0);
      if (!r.length || !c.length) return null;
      return { x0: x0 + c[0][0], x1: x0 + c[c.length - 1][1], y0: y0 + r[0][0], y1: y0 + r[r.length - 1][1] };
    }
    function stats(b) {
      var bw = b.x1 - b.x0 + 1, bh = b.y1 - b.y0 + 1;
      var n = 0, sr = 0, sg = 0, sb = 0, starts = 0, near = 0;
      for (y = b.y0; y <= b.y1; y++) {
        for (x = b.x0; x <= b.x1; x++) {
          if (!ink[y * w + x]) continue;
          if (x === b.x0 || !ink[y * w + x - 1]) starts++;
          i = (y * w + x) * 4; n++; sr += d[i]; sg += d[i + 1]; sb += d[i + 2];
        }
      }
      if (n) { sr /= n; sg /= n; sb /= n; }
      for (y = b.y0; y <= b.y1; y++) for (x = b.x0; x <= b.x1; x++) if (ink[y * w + x]) { i = (y * w + x) * 4; if (Math.abs(d[i] - sr) + Math.abs(d[i + 1] - sg) + Math.abs(d[i + 2] - sb) < 120) near++; }
      return { w: bw, h: bh, ratio: +(bw / bh).toFixed(2), single: n ? +(near / n).toFixed(2) : 0, detail: +(starts / bh).toFixed(1), fill: +(n / (bw * bh)).toFixed(2) };
    }
    // Small images lose the emblem's detail, so they need less of it; portrait letters still stay at 1–3.
    function emblemLike(st) { return st.h >= 24 && st.ratio >= 0.45 && st.ratio <= 0.8 && st.single >= 0.85 && st.detail >= (st.h < 60 ? 3.5 : EMBLEM_DETAIL); }
    var tried = [];
    var rowHas = [], colHas = [];
    for (y = 0; y < h; y++) for (x = 0; x < w; x++) if (ink[y * w + x]) { rowHas[y] = true; colHas[x] = true; }
    var bands = runs(rowHas, 1);
    if (!bands.length) return { found: false, why: "empty image" };
    var contentH = bands[bands.length - 1][1] - bands[0][0] + 1;
    // Stacked lockup: the top row holds a single mark.
    if (bands.length >= 2) {
      var top = bands[0];
      var tops = runs(colHas.map(function (_, cx) { for (var cy = top[0]; cy <= top[1]; cy++) if (ink[cy * w + cx]) return true; return false; }), 2);
      if (tops.length === 1) {
        var tb = box(tops[0][0], tops[0][1], top[0], top[1]);
        var ts = tb && stats(tb);
        if (ts) tried.push({ where: "top", st: ts });
        if (ts && ts.h >= contentH * 0.25 && emblemLike(ts)) return { found: true, why: "top", st: ts, tried: tried };
      }
    }
    // Side-by-side lockup or banner: a mark at either end, clearly taller than its neighbour.
    var cols = runs(colHas, 2).map(function (c) { return box(c[0], c[1], 0, h - 1); }).filter(function (b) { return b && (b.x1 - b.x0 + 1) / (b.y1 - b.y0 + 1) >= 0.15; });
    if (cols.length >= 2) {
      var ends = [["left", cols[0], cols[1]], ["right", cols[cols.length - 1], cols[cols.length - 2]]];
      for (var e = 0; e < ends.length; e++) {
        var blk = ends[e][1], nb = ends[e][2];
        // The motto under the emblem is often wider than the emblem; measure the mark above it.
        // Rows with only a few pixels (drop shadows, anti-aliasing) count as gaps.
        var minInk = Math.max(1, Math.round((blk.x1 - blk.x0 + 1) * 0.03));
        var inner = runs(rowHas.map(function (_, ry) { if (ry < blk.y0 || ry > blk.y1) return false; for (var rx = blk.x0, cnt = 0; rx <= blk.x1; rx++) if (ink[ry * w + rx]) cnt++; return cnt > minInk; }), 1);
        var mark = inner.length >= 2 && inner[0][1] - inner[0][0] + 1 >= (blk.y1 - blk.y0 + 1) * 0.6 ? box(blk.x0, blk.x1, inner[0][0], inner[0][1]) : blk;
        var st = stats(mark);
        tried.push({ where: ends[e][0], st: st });
        if (emblemLike(st) && blk.y1 - blk.y0 + 1 >= (nb.y1 - nb.y0 + 1) * 1.3) return { found: true, why: ends[e][0], st: st, tried: tried };
      }
    }
    return { found: false, why: "no emblem-like mark", tried: tried, size: [w, h] };
  }
  // Ink runs per row: real emblems measure about 5–11 (less when blurred), portrait letters 1–3.
  var EMBLEM_DETAIL = 4.5;

  window.__dbim = {
    collectViewport: collectViewport,
    collectPage: collectPage,
    stickyCheck: stickyCheck,
    hoverStyles: hoverStyles,
    perf: perf,
    findSearchInput: findSearchInput,
    emblemInLockup: emblemInLockup,
  };
})();
