/* Náborový web — odhad ceny z window.CENY, lead formulár, odhalenie sekcií. */
(function () {
  "use strict";
  var D = window.CENY || { okresy: {}, kraje: {}, slovensko: {} };
  var STAV = { povodny: 0.88, ciastocna: 0.97, kompletna: 1.05, novostavba: 1.12 };
  var PLOCHA = { byt: 55, dom: 120, pozemok: 800 };
  var SLOVO = { byt: "byt", dom: "dom", pozemok: "pozemok" };
  var fmt = new Intl.NumberFormat("sk-SK", { maximumFractionDigits: 0 });
  var eur = function (n) { return fmt.format(n) + " €"; };

  function krajOkresu(o) {
    var x = D.okresy[o];
    return x && x.kraj;
  }

  function stat(okres, typ) {
    var o = D.okresy[okres] || {};
    if (o[typ]) return { s: o[typ], kde: "okres " + okres, uroven: "okres" };
    var k = krajOkresu(okres);
    if (k && D.kraje[k] && D.kraje[k][typ]) return { s: D.kraje[k][typ], kde: k + ({ "Bratislavský kraj": " bez Bratislavy", "Košický kraj": " bez Košíc" }[k] || ""), uroven: "kraj" };
    return { s: D.slovensko[typ], kde: "Slovensko", uroven: "sk" };
  }

  function zakladM2(okres, typ, izby, st) {
    var s = st.s;
    if (typ !== "byt" || !izby) return s.m2;
    if (s.izby && s.izby[izby]) return s.izby[izby].m2;
    // Málo bytov s daným počtom izieb: pomer z kraja, inak zo Slovenska.
    var k = krajOkresu(okres);
    var vzor = (k && D.kraje[k] && D.kraje[k].byt) || D.slovensko.byt;
    if (vzor && vzor.izby && vzor.izby[izby]) return s.m2 * vzor.izby[izby].m2 / vzor.m2;
    return s.m2;
  }

  function zaokruhli(n) {
    var krok = n < 60000 ? 500 : 1000;
    return Math.round(n / krok) * krok;
  }

  var nacitane = Date.now();
  // Zdroj návštevy (reklama, e-mail) sa pošle s dopytom, aby maklér videl, čo funguje.
  var utm = {};
  try {
    var q = new URLSearchParams(location.search);
    ["utm_source", "utm_medium", "utm_campaign", "utm_content"].forEach(function (k) { if (q.get(k)) utm[k] = q.get(k); });
    if (document.referrer && document.referrer.indexOf(location.host) < 0) utm.referrer = document.referrer.slice(0, 120);
  } catch (e) {}

  function initCalc(form) {
    var $ = function (sel) { return form.querySelector(sel); };
    var out = function (k) { return form.querySelector('[data-out="' + k + '"]'); };
    var plochaUpravena = false;
    var posledny = null;
    var h1 = document.querySelector('[data-out="h1typ"]');
    var h1Vas = h1 && /^váš/.test(h1.textContent.trim());

    var params = new URLSearchParams(location.search);
    if (params.get("okres") && D.okresy[params.get("okres")]) $('[name="okres"]').value = params.get("okres");
    if (params.get("typ") && PLOCHA[params.get("typ")]) {
      var r = $('[name="typ"][value="' + params.get("typ") + '"]');
      if (r) { r.checked = true; $('[name="plocha"]').value = PLOCHA[r.value]; }
    }

    function hodnota(name) {
      var el = form.querySelector('[name="' + name + '"]:checked') || form.querySelector('[name="' + name + '"]');
      return el ? el.value : "";
    }

    function prepocitaj() {
      var typ = hodnota("typ");
      var okres = hodnota("okres");
      var izby = hodnota("izby");
      var stav = hodnota("stav");
      var plocha = parseFloat(String($('[name="plocha"]').value).replace(",", "."));

      form.querySelectorAll("[data-pre]").forEach(function (el) {
        el.hidden = el.getAttribute("data-pre").split(" ").indexOf(typ) < 0;
      });
      if (h1) h1.textContent = (h1Vas ? "váš " : "") + SLOVO[typ];
      out("pinlabel").textContent = "váš " + SLOVO[typ];

      var st = stat(okres, typ);
      if (!st.s || !plocha || plocha < 10) {
        out("cena").textContent = "Zadajte plochu";
        out("pozn").textContent = "";
        posledny = null;
        return;
      }
      var m2 = zakladM2(okres, typ, typ === "byt" ? izby : null, st);
      if (typ !== "pozemok") m2 *= STAV[stav] || 1;
      var stred = m2 * plocha;
      var od = zaokruhli(stred * 0.93), po = zaokruhli(stred * 1.07);
      out("cena").textContent = fmt.format(od) + " – " + eur(po);

      // Pravítko: pásmo bežných cien (Q1–Q3) a poloha odhadu v €/m².
      var lo = st.s.q1 * 0.65, hi = st.s.q3 * 1.35;
      var pct = function (v) { return Math.max(0, Math.min(100, (v - lo) / (hi - lo) * 100)); };
      out("band").style.left = pct(st.s.q1) + "%";
      out("band").style.width = (pct(st.s.q3) - pct(st.s.q1)) + "%";
      out("median").style.left = pct(st.s.m2) + "%";
      var p = pct(m2), pin = out("pin");
      pin.style.left = p + "%";
      pin.classList.toggle("is-left", p < 12);
      pin.classList.toggle("is-right", p > 88);
      out("min").textContent = fmt.format(Math.round(lo / 100) * 100) + " €/m²";
      out("max").textContent = fmt.format(Math.round(hi / 100) * 100) + " €/m²";

      var nazov = { byt: "bytov", dom: "domov", pozemok: "pozemkov" }[typ];
      var pozn = "≈ " + fmt.format(Math.round(m2 / 10) * 10) + " €/m² · podľa " + fmt.format(st.s.n) + " ponúk " + nazov + " (" + st.kde + ")";
      if (st.uroven !== "okres") pozn = "V okrese " + okres + " je zatiaľ málo ponúk, počítame širšie. " + pozn;
      out("pozn").textContent = pozn;
      posledny = { typ: typ, okres: okres, plocha: plocha, izby: typ === "byt" ? izby : null,
                   stav: typ === "pozemok" ? null : stav, od: od, do: po, m2: Math.round(m2) };
      window.NABER_ODHAD = posledny;
      document.dispatchEvent(new CustomEvent("odhad", { detail: posledny }));
    }

    form.addEventListener("input", function (e) {
      if (e.target.name === "plocha") plochaUpravena = true;
      if (e.target.name === "typ" && !plochaUpravena) $('[name="plocha"]').value = PLOCHA[e.target.value];
      if (["meno", "telefon", "email", "suhlas", "kedy", "web_stranka"].indexOf(e.target.name) < 0) prepocitaj();
    });
    form.addEventListener("change", function (e) {
      if (e.target.name === "okres" || e.target.name === "typ") prepocitaj();
    });

    form.querySelector('[data-akcia="pokracuj"]').addEventListener("click", function () {
      form.querySelector('[data-krok="1"]').hidden = true;
      form.querySelector('[data-krok="2"]').hidden = false;
      $('[name="meno"]').focus({ preventScroll: true });
    });

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var chyba = out("chyba");
      var meno = $('[name="meno"]').value.trim();
      var tel = $('[name="telefon"]').value.replace(/[^\d+]/g, "");
      var msg = "";
      if (meno.length < 2) msg = "Napíšte, prosím, svoje meno.";
      else if (tel.replace(/\D/g, "").length < 9) msg = "Skontrolujte, prosím, telefónne číslo.";
      else if (!$('[name="suhlas"]').checked) msg = "Bez súhlasu so spracovaním údajov vám nemôžem odpovedať.";
      chyba.hidden = !msg;
      chyba.textContent = msg;
      if (msg) return;

      var hotovo = function () {
        form.querySelector('[data-krok="2"]').hidden = true;
        form.querySelector('[data-krok="3"]').hidden = false;
      };
      var endpoint = form.getAttribute("data-endpoint");
      if (!endpoint) { hotovo(); return; }
      var btn = form.querySelector('[type="submit"]');
      btn.disabled = true;
      fetch(endpoint, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ web: form.getAttribute("data-web"), meno: meno, telefon: tel,
                               email: $('[name="email"]').value.trim(), kedy: (form.querySelector('[name="kedy"]:checked') || {}).value || "",
                               odhad: posledny, stranka: location.href.split("?")[0], utm: utm,
                               hp: $('[name="web_stranka"]').value, t: Date.now() - nacitane })
      }).then(function (r) {
        if (!r.ok) throw new Error(r.status);
        hotovo();
      }).catch(function () {
        btn.disabled = false;
        chyba.hidden = false;
        chyba.textContent = "Odoslanie sa nepodarilo. Zavolajte mi, prosím, priamo.";
      });
    });

    prepocitaj();
  }

  document.querySelectorAll("form.calc").forEach(initCalc);

  // Hlavička nad fotkou je priehľadná, po prvom zrolovaní dostane papierové pozadie.
  var top = document.querySelector("[data-top]");
  if (top && "IntersectionObserver" in window) {
    var znacka = document.createElement("div");
    znacka.style.cssText = "position:absolute;top:0;left:0;width:1px;height:64px;pointer-events:none";
    document.body.prepend(znacka);
    new IntersectionObserver(function (e) {
      top.classList.toggle("is-solid", !e[0].isIntersecting);
    }).observe(znacka);
  }

  // Postupné odhalenie sekcií — bez knižníc, nič nebeží, keď sa nescrolluje.
  var items = document.querySelectorAll(".reveal");
  if ("IntersectionObserver" in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { en.target.classList.add("is-in"); io.unobserve(en.target); }
      });
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.08 });
    items.forEach(function (el) { io.observe(el); });
  } else {
    items.forEach(function (el) { el.classList.add("is-in"); });
  }
})();


/* Sekcie pod odhadom: podobné ponuky, mapa, čistý výnos, pred/po, doklady, strážca ceny. */
(function () {
  "use strict";
  var fmt = new Intl.NumberFormat("sk-SK", { maximumFractionDigits: 0 });
  var eur = function (n) { return fmt.format(Math.round(n)) + " €"; };
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var D = window.CENY || {};
  var P = window.POROVNANIA || {};
  var ENDPOINT = ($("form.calc") || { getAttribute: function () { return ""; } }).getAttribute("data-endpoint") || "";
  var WEB = ($("form.calc") || { getAttribute: function () { return ""; } }).getAttribute("data-web") || "";
  var nacitane = Date.now();

  // --- podobné ponuky pod odhadom
  function porovnania(o) {
    var box = $('[data-out="comp"]');
    if (!box) return;
    var rows = o && P[o.okres] && P[o.okres][o.typ];
    if (!rows || !rows.length) { box.hidden = true; return; }
    var izby = o.izby ? parseInt(o.izby, 10) : 0;
    var vyber = rows.filter(function (r) { return o.typ !== "byt" || !izby || (izby >= 5 ? r[0] >= 5 : r[0] === izby); });
    if (vyber.length < 3) vyber = rows.slice();
    vyber.sort(function (a, b) { return Math.abs(a[1] - o.plocha) - Math.abs(b[1] - o.plocha); });
    var nazov = { byt: "byt", dom: "dom", pozemok: "pozemok" }[o.typ];
    box.querySelector("ul").innerHTML = vyber.slice(0, 4).map(function (r) {
      var co = (o.typ === "byt" && r[0] ? r[0] + "-izb. " : "") + nazov + " · " + r[1] + " m²";
      return "<li><b>" + co + "</b><em>" + eur(r[2]) + "</em><span>" + (r[3] || "") + "</span><span>" +
        fmt.format(Math.round(r[2] / r[1])) + " €/m²</span></li>";
    }).join("");
    box.hidden = false;
  }

  // --- mapa: tooltip a prepnutie okresu v odhade
  function mapa() {
    var svg = $(".map__svg"), tip = $('[data-out="maptip"]');
    if (!svg || !tip) return;
    var wrap = svg.parentNode;
    svg.addEventListener("mousemove", function (e) {
      var p = e.target.closest("path");
      if (!p) { tip.hidden = true; return; }
      var r = wrap.getBoundingClientRect();
      tip.innerHTML = "<b>" + p.getAttribute("data-okres") + "</b>" + p.getAttribute("data-info");
      tip.style.left = (e.clientX - r.left) + "px";
      tip.style.top = (e.clientY - r.top) + "px";
      tip.hidden = false;
    });
    svg.addEventListener("mouseleave", function () { tip.hidden = true; });
    svg.addEventListener("click", function (e) {
      var p = e.target.closest("path");
      var sel = $('form.calc [name="okres"]');
      if (!p || !sel) return;
      var o = p.getAttribute("data-okres");
      if (![].some.call(sel.options, function (x) { return x.value === o; })) return;
      sel.value = o;
      sel.dispatchEvent(new Event("change", { bubbles: true }));
      $("#odhad").scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  // --- koľko vám zostane
  function cistyVynos() {
    var f = $("[data-net]");
    if (!f) return;
    var rokTeraz = parseInt((D.aktualizovane || "").slice(0, 4), 10) || new Date().getFullYear();
    var cenaUpravena = false;
    var v = function (n) { var x = parseFloat(String(f.elements[n].value).replace(",", ".")); return isNaN(x) ? 0 : x; };
    var out = function (k, t, nula) {
      var el = $('[data-out="' + k + '"]', f);
      el.textContent = t;
      el.parentNode.classList.toggle("is-zero", !!nula);
    };
    function prepocet() {
      var cena = v("n_cena"), ako = f.elements.n_ako.value, rok = v("n_rok");
      $('[data-out="n_rok_label"]', f).textContent = ako === "dedenie_priamy" ? "Rok, keď ju získal rodič" : "Rok zápisu do katastra";
      var roky = rokTeraz - rok;
      var oslobodene = rok > 0 && roky > 5;
      var hranicne = rok > 0 && roky === 5;
      var provizia = cena * v("n_provizia") / 100;
      var poplatky = cena > 0 ? 200 : 0;            // vklad 50 € elektronicky + energetický certifikát cca 150 €
      var zisk = Math.max(0, cena - v("n_nakup") - v("n_investicie") - provizia - poplatky);
      var dan = 0, odvody = 0;
      if (!oslobodene && cena > 0) {
        dan = 0.19 * Math.min(zisk, 50234.18) + 0.25 * Math.max(0, zisk - 50234.18);
        odvody = 0.16 * zisk;
      }
      var hypo = v("n_hypo");
      out("n_o_cena", cena ? eur(cena) : "—");
      out("n_o_provizia", cena ? "− " + eur(provizia) : "—");
      out("n_o_poplatky", cena ? "− cca " + eur(poplatky) : "—");
      out("n_o_dan", oslobodene ? "0 € · oslobodené" : (cena ? "− " + eur(dan) : "—"), oslobodene);
      out("n_o_odvody", oslobodene ? "0 € · oslobodené" : (cena ? "− " + eur(odvody) : "—"), oslobodene);
      out("n_o_hypo", hypo ? "− " + eur(hypo) : "0 €");
      out("n_o_spolu", cena ? eur(cena - provizia - poplatky - dan - odvody - hypo) : "—");
      var pozn = "";
      if (hranicne) pozn = "Presne 5 rokov: o oslobodení rozhoduje dátum povolenia vkladu. Ak predáte až po ňom, daň ani odvody neplatíte.";
      else if (!oslobodene && cena && !v("n_nakup")) pozn = ako === "kupa" ? "Doplňte kúpnu cenu — daň sa platí len zo zisku." : "Pri dedičstve doplňte hodnotu nehnuteľnosti z konania — daň sa platí len zo zisku.";
      $('[data-out="n_pozn"]', f).textContent = pozn;
    }
    f.addEventListener("input", function (e) { if (e.target.name === "n_cena") cenaUpravena = true; prepocet(); });
    f.addEventListener("change", prepocet);
    function zOdhadu(o) {
      if (cenaUpravena || !o) return;
      f.elements.n_cena.value = Math.round((o.od + o.do) / 2 / 1000) * 1000;
      prepocet();
    }
    document.addEventListener("odhad", function (e) { zOdhadu(e.detail); });
    zOdhadu(window.NABER_ODHAD);
    prepocet();
  }

  // --- pred / po
  function stage() {
    document.querySelectorAll("[data-stage]").forEach(function (s) {
      var r = s.querySelector(".stage__range");
      var set = function () { s.style.setProperty("--x", r.value + "%"); };
      r.addEventListener("input", set); set();
    });
  }

  // --- doklady: odškrtnutia si web pamätá v prehliadači
  function doklady() {
    var box = $("#doklady");
    if (!box) return;
    var key = "naber-doklady-" + WEB, stav = {};
    try { stav = JSON.parse(localStorage.getItem(key) || "{}"); } catch (e) {}
    var boxes = box.querySelectorAll("[data-doklad]");
    var pocitaj = function () {
      var n = [].filter.call(boxes, function (b) { return b.checked; }).length;
      $('[data-out="docs"]', box).textContent = n + " z " + boxes.length + " pripravených";
    };
    boxes.forEach(function (b) {
      b.checked = !!stav[b.getAttribute("data-doklad")];
      b.addEventListener("change", function () {
        stav[b.getAttribute("data-doklad")] = b.checked;
        try { localStorage.setItem(key, JSON.stringify(stav)); } catch (e) {}
        pocitaj();
      });
    });
    pocitaj();
    var t = box.querySelector('[data-akcia="tlac"]');
    if (t) t.addEventListener("click", function () { window.print(); });
  }

  // --- strážca ceny
  function strazca() {
    var f = $("[data-watch]");
    if (!f) return;
    var co = $('[data-out="w_co"]', f), aktualny = window.NABER_ODHAD;
    var popis = function (o) {
      if (!o) return;
      aktualny = o;
      co.textContent = ({ byt: "Byt", dom: "Dom", pozemok: "Pozemok" }[o.typ]) + (o.izby ? " · " + o.izby + "-izb." : "") +
        " · " + o.plocha + " m² · okres " + o.okres;
    };
    document.addEventListener("odhad", function (e) { popis(e.detail); });
    popis(aktualny);
    f.addEventListener("submit", function (e) {
      e.preventDefault();
      var chyba = $('[data-out="w_chyba"]', f);
      var email = f.elements.w_email.value.trim();
      var msg = !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) ? "Skontrolujte, prosím, e-mail."
        : !f.elements.w_suhlas.checked ? "Bez súhlasu vám nemôžem posielať prehľad." : "";
      chyba.hidden = !msg; chyba.textContent = msg;
      if (msg || !ENDPOINT) return;
      var btn = f.querySelector('[type="submit"]'); btn.disabled = true;
      fetch(ENDPOINT.replace(/\/lead$/, "/strazca"), {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ web: WEB, email: email, odhad: aktualny, hp: f.elements.w_hp.value, t: Date.now() - nacitane,
                               stranka: location.href.split("?")[0] })
      }).then(function (r) {
        if (!r.ok) throw new Error(r.status);
        $('[data-out="w_ok"]', f).hidden = false; btn.hidden = true;
      }).catch(function () {
        btn.disabled = false; chyba.hidden = false; chyba.textContent = "Nepodarilo sa. Skúste to, prosím, neskôr.";
      });
    });
  }

  document.addEventListener("odhad", function (e) { porovnania(e.detail); });
  porovnania(window.NABER_ODHAD);
  mapa(); cistyVynos(); stage(); doklady(); strazca();
})();
