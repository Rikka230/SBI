const CONTACT_EMAIL = "contact@usmfootball.com";

function getValue(form, selector) {
  const field = form.querySelector(selector);
  return field && field.value ? field.value.trim() : "";
}

function requestLabel(value) {
  if (value === "joueur") return "Je suis un joueur";
  if (value === "club") return "Je représente un club";
  if (value === "coach") return "Je suis coach";
  if (value === "staff") return "Je suis membre du staff";
  if (value === "autre") return "Autre demande";
  return value || "Non précisé";
}

function createNotice(form, message, isError) {
  let notice = form.querySelector(".contact-mail-notice");
  if (!notice) {
    notice = document.createElement("p");
    notice.className = "contact-mail-notice";
    notice.style.marginTop = "14px";
    notice.style.fontSize = "0.9rem";
    notice.style.lineHeight = "1.45";
    form.appendChild(notice);
  }

  notice.textContent = message;
  notice.style.color = isError ? "#ff6b8a" : "rgba(255,255,255,0.72)";
}

function initContactMailFallback() {
  const form = document.querySelector(".public-form");
  if (!form || form.dataset.mailFallbackReady === "true") return;

  form.dataset.mailFallbackReady = "true";
  form.setAttribute("action", "mailto:" + CONTACT_EMAIL);
  form.setAttribute("method", "post");
  form.setAttribute("enctype", "text/plain");

  form.addEventListener("submit", function (event) {
    event.preventDefault();

    const name = getValue(form, 'input[name="name"], input[type="text"]');
    const email = getValue(form, 'input[name="email"], input[type="email"]');
    const phone = getValue(form, 'input[name="phone"], input[type="tel"]');
    const type = getValue(form, 'select[name="profile"], select');
    const message = getValue(form, 'textarea[name="message"], textarea');

    if (!name || !email || !phone || !message) {
      createNotice(form, "Merci de remplir votre nom, votre email, votre téléphone et votre message avant l’envoi.", true);
      return;
    }

    const subject = "Demande de contact USM Football - " + name;
    const body = [
      "Bonjour,",
      "",
      "Vous trouverez ci-dessous ma demande envoyée depuis le site USM Football.",
      "",
      "Nom : " + name,
      "Email : " + email,
      "Téléphone : " + phone,
      "Profil : " + requestLabel(type),
      "",
      "Message :",
      message,
      "",
      "---",
      "Message préparé automatiquement depuis le formulaire du site USM Football."
    ].join("\n");

    createNotice(form, "Votre application mail va s’ouvrir avec le message prérempli. Il restera simplement à l’envoyer.", false);

    window.location.href =
      "mailto:" +
      CONTACT_EMAIL +
      "?subject=" +
      encodeURIComponent(subject) +
      "&body=" +
      encodeURIComponent(body);
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initContactMailFallback);
} else {
  initContactMailFallback();
}
