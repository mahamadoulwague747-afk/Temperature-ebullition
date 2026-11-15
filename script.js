const API = "https://pubchem.ncbi.nlm.nih.gov/rest/pug";
const API_VIEW = "https://pubchem.ncbi.nlm.nih.gov/rest/pug_view/data/compound";

const form = document.getElementById("search-form");
const input = document.getElementById("query");
const statusEl = document.getElementById("status");
const result = document.getElementById("result");

async function getJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error("HTTP " + res.status);
  return res.json();
}

// 1) Trouver l'identifiant PubChem (CID) : d'abord par nom, sinon par formule
async function findCid(query) {
  const q = encodeURIComponent(query.trim());
  try {
    const d = await getJSON(`${API}/compound/name/${q}/cids/JSON`);
    return d.IdentifierList.CID[0];
  } catch (e) {
    const d = await getJSON(`${API}/compound/fastformula/${q}/cids/JSON`);
    return d.IdentifierList.CID[0];
  }
}

// 2) Formule brute, nom IUPAC, masse molaire
async function getProps(cid) {
  const d = await getJSON(`${API}/compound/cid/${cid}/property/MolecularFormula,MolecularWeight,IUPACName/JSON`);
  return d.PropertyTable.Properties[0];
}

// 3) Numéro CAS : on le repère parmi les synonymes (format 123-45-6)
async function getCas(cid) {
  const d = await getJSON(`${API}/compound/cid/${cid}/synonyms/JSON`);
  const syn = d.InformationList.Information[0].Synonym || [];
  return syn.find(s => /^\d{2,7}-\d{2}-\d$/.test(s)) || "non trouvé";
}

// 4) Point d'ébullition : section « Boiling Point » des propriétés expérimentales
function collectStrings(node, out = []) {
  if (!node || typeof node !== "object") return out;
  if (Array.isArray(node)) { node.forEach(n => collectStrings(n, out)); return out; }
  if (node.StringWithMarkup) node.StringWithMarkup.forEach(s => out.push(s.String));
  Object.values(node).forEach(v => collectStrings(v, out));
  return out;
}
async function getBoilingPoint(cid) {
  try {
    const d = await getJSON(`${API_VIEW}/${cid}/JSON?heading=Boiling+Point`);
    const values = [...new Set(collectStrings(d.Record.Section))];
    return values.slice(0, 3);
  } catch (e) {
    return [];
  }
}

// Affichage : CO2 -> CO₂
function subscript(formula) {
  const sub = "₀₁₂₃₄₅₆₇₈₉";
  return formula.replace(/\d/g, d => sub[d]);
}

function setStatus(msg, isError = false) {
  statusEl.textContent = msg;
  statusEl.className = isError ? "error" : "";
}

async function search(query) {
  result.hidden = true;
  setStatus("Recherche en cours…");
  try {
    const cid = await findCid(query);
    const [props, cas, bp] = await Promise.all([getProps(cid), getCas(cid), getBoilingPoint(cid)]);

    document.getElementById("structure").src = `${API}/compound/cid/${cid}/PNG?image_size=400x400`;
    document.getElementById("structure").alt = "Structure de " + query;
    document.getElementById("iupac").textContent = props.IUPACName || "";
    document.getElementById("formula").textContent = subscript(props.MolecularFormula);
    document.getElementById("cas").textContent = cas;
    document.getElementById("mass").textContent = Number(props.MolecularWeight).toFixed(2) + " g/mol";

    const bpEl = document.getElementById("bp");
    bpEl.textContent = "";
    if (bp.length) {
      bpEl.textContent = bp[0];
      if (bp.length > 1) {
        const small = document.createElement("small");
        small.textContent = "Autres valeurs : " + bp.slice(1).join(" ; ");
        bpEl.appendChild(small);
      }
    } else {
      bpEl.textContent = "Non renseigné";
    }

    result.hidden = false;
    setStatus("");
  } catch (e) {
    setStatus("Molécule introuvable. Essaie le nom en anglais (ex. : carbon dioxide) ou la formule (ex. : CO2).", true);
  }
}

form.addEventListener("submit", e => {
  e.preventDefault();
  search(input.value);
});
document.querySelectorAll(".chip").forEach(btn =>
  btn.addEventListener("click", () => { input.value = btn.dataset.q; search(btn.dataset.q); })
);
