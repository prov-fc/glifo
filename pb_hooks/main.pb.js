/**
 * Viene Eseguita per ogni richiesta
 * Questa funzione da da "firewall" per limitare le rotte che possono esere chiamate dall'esterno
 */
function LimitaRotte(e) {

  // Esempio: 123.123.123:12345. Richieste da IP interni cominciano con 172.20
  const forwarded_for = e.request.header.get("X-Forwarded-For");

  // Contiene il path della richiesta. Esempio: /links, /assets/style.css, etc.
  const original_url = e.request.header.get("X-Original-Url");

  if (!forwarded_for.startsWith("172.20.")) {
    // provviene dall'esterno
    if (original_url.startsWith("/api")) {
      // blocca /api* TRANNE /api/collections e /api/files
      if (!original_url.startsWith("/api/collections/") && !original_url.startsWith("/api/files/")) {
        throw new BadRequestError("Invalid request")
      }
    }
    if (original_url.startsWith("/_")) {
      // blocca pagina admin
      throw new BadRequestError("Invalid request")
    }
  }

  return e.next() // proceed with the request chain
}


routerUse(LimitaRotte)


/**
 * Viene chiamato dopo la _creazione_ di un nuovo link.
 * Appena creato un nuovo link, genera un QR code per il link al documento e lo allega al campo corretto del link
 */
onRecordCreateRequest((e) => {
  e.next();
  try {
    const record = $app.findRecordById("links", e.record.id);

    const qrdata = encodeURIComponent("https://documenti.provincia.fc.it/links?id=" + e.record.id);

    const res = $http.send({
      url: "https://quickchart.io/qr?margin=1&size=256&text=" + qrdata,
      method: "get",
    });

    if (res.statusCode != 200) {
      throw new Error("Status code not 200");
    }

    if (res.headers['Content-Type'][0] != 'image/png') {
      throw new Error("File is not an image");
    }

    const file1 = $filesystem.fileFromBytes(res.raw, "qr_" + e.record.id + ".png");
    //console.log(JSON.stringify(res, null, 4));
    record.set("qr", file1)
    $app.save(record)
    //console.log("QR code created and attached");

  } catch (e) {
    console.log(e);
  }
}, "links");




const linksHandler = (e) => {
  const layoutTpl = `${__hooks}/views/layout.html`
  const errorTpl = `${__hooks}/views/error.html`
  const documentoTpl = `${__hooks}/views/documento.html`

  const tplError = $template.loadFiles(layoutTpl, errorTpl)
  const tplDocumento = $template.loadFiles(layoutTpl, documentoTpl)

  const formatDate = (d) => {
    const date = new Date(d)
    const day = String(date.getDate()).padStart(2, '0')
    const month = String(date.getMonth() + 1).padStart(2, '0')
    return `${day}/${month}/${date.getFullYear()}`
  }
  
  const renderError = (msg) => tplError.render({ error_message: msg })
  // Try to find the record
  let record
  try {
    record = $app.findRecordById("links", e.request.url.query().get("id"))
  } catch (err) {
    return e.html(404, renderError("Il file non è stato trovato"))
  }

  if (record.get("stato") == "revocato") {
    return e.html(404, renderError("Il file è stato revocato"))
  }

  if (record.get("stato") != "attivo" || !record.get("documento")) {
    return e.html(404, renderError("Il file non è stato trovato"))
  }

  

  let data = {
    documento: record.get("documento"),
    nome: record.get("nome"),
    // custom
    scadenza_formatted: record.get("scadenza") != "" ? formatDate(record.get("scadenza")) : "",
    scadenza_scaduta: (record.get("scadenza") && (new Date() > new Date(record.get("scadenza")))),
    documento_url: "/api/files/" + record.collection().id + "/" + record.id + "/" + record.get("documento"),
    documento_ispdf: record.get("documento").endsWith(".pdf")
  }

  return e.html(200, tplDocumento.render(data))
}

routerAdd("GET", "/links/", linksHandler)
routerAdd("GET", "/links", linksHandler)