// Connexion / création de compte (côté navigateur uniquement)
// Les comptes sont stockés dans le localStorage ; les mots de passe ne sont JAMAIS stockés en clair :
// on enregistre un "sel" aléatoire + l'empreinte PBKDF2-SHA256 du mot de passe.
(() => {
  const $ = id => document.getElementById(id);
  const USERS_KEY = "molecule_users", SESSION_KEY = "molecule_session";
  const enc = new TextEncoder();
  const toHex = buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
  const fromHex = hex => Uint8Array.from(hex.match(/.{2}/g), h => parseInt(h, 16));

  async function hashPassword(password, saltHex) {
    const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
    const bits = await crypto.subtle.deriveBits(
      { name: "PBKDF2", salt: fromHex(saltHex), iterations: 150000, hash: "SHA-256" }, key, 256);
    return toHex(bits);
  }
  const loadUsers = () => { try { return JSON.parse(localStorage.getItem(USERS_KEY)) || {}; } catch (e) { return {}; } };
  const saveUsers = u => localStorage.setItem(USERS_KEY, JSON.stringify(u));

  let mode = "login", failures = 0, lockedUntil = 0;

  function setMode(m) {
    mode = m;
    const reg = m === "register";
    $("tab-login").classList.toggle("active", !reg);
    $("tab-register").classList.toggle("active", reg);
    $("confirm-wrap").hidden = !reg;
    $("auth-submit").textContent = reg ? "Créer mon compte" : "Se connecter";
    $("auth-pass").autocomplete = reg ? "new-password" : "current-password";
    msg("");
  }
  function msg(text, ok = false) { const el = $("auth-msg"); el.textContent = text; el.className = ok ? "ok" : ""; }

  function showApp(name) {
    $("auth").hidden = true;
    $("app").hidden = false;
    $("user-label").textContent = "Connecté : " + name;
  }
  function showLogin() {
    $("app").hidden = true;
    $("auth").hidden = false;
    $("auth-form").reset();
    setMode("login");
  }

  async function submit(e) {
    e.preventDefault();
    if (!window.crypto || !crypto.subtle) { msg("Ce navigateur ne permet pas le chiffrement ici (utilise https ou localhost)."); return; }
    const name = $("auth-user").value.trim();
    const pass = $("auth-pass").value;
    const key = name.toLowerCase();
    if (!/^[A-Za-z0-9._-]{3,20}$/.test(name)) { msg("Nom d'utilisateur : 3 à 20 caractères (lettres, chiffres, . _ -)."); return; }
    if (pass.length < 8) { msg("Le mot de passe doit contenir au moins 8 caractères."); return; }
    const users = loadUsers();

    if (mode === "register") {
      if (pass !== $("auth-pass2").value) { msg("Les deux mots de passe sont différents."); return; }
      if (users[key]) { msg("Ce nom d'utilisateur existe déjà."); return; }
      const salt = toHex(crypto.getRandomValues(new Uint8Array(16)));
      users[key] = { name, salt, hash: await hashPassword(pass, salt) };
      saveUsers(users);
      sessionStorage.setItem(SESSION_KEY, key);
      showApp(name);
      return;
    }

    if (Date.now() < lockedUntil) { msg("Trop d'essais. Réessaie dans quelques secondes."); return; }
    const user = users[key];
    const ok = user && (await hashPassword(pass, user.salt)) === user.hash;
    if (!ok) {
      failures++;
      if (failures >= 5) { lockedUntil = Date.now() + 30000; failures = 0; }
      msg("Nom d'utilisateur ou mot de passe incorrect.");
      return;
    }
    failures = 0;
    sessionStorage.setItem(SESSION_KEY, key);
    showApp(user.name);
  }

  $("tab-login").addEventListener("click", () => setMode("login"));
  $("tab-register").addEventListener("click", () => setMode("register"));
  $("auth-form").addEventListener("submit", submit);
  $("show-pass").addEventListener("change", e => {
    $("auth-pass").type = $("auth-pass2").type = e.target.checked ? "text" : "password";
  });
  $("btn-logout").addEventListener("click", () => { sessionStorage.removeItem(SESSION_KEY); showLogin(); });

  // Session déjà ouverte dans cet onglet ?
  const current = sessionStorage.getItem(SESSION_KEY);
  const user = current && loadUsers()[current];
  if (user) showApp(user.name);
})();
