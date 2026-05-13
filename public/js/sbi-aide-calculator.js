const SBI_AID_CALCULATOR_VERSION = '8.0P.144';
const SBI_RNCP_LEVEL = 4;
const DEFAULT_SMIC_MONTHLY = 1823.03;
const STANDARD_AID_AMOUNT = 5000;
const DISABLED_APPRENTICE_AID_AMOUNT = 6000;
const REFERENCE_MONTHS = 12;

function parseFrenchNumber(value, fallback = 0) {
  if (value === null || value === undefined || value === '') return fallback;
  const normalized = String(value)
    .replace(/\s/g, '')
    .replace(',', '.')
    .replace(/[^0-9.-]/g, '');
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function roundMoney(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function formatEuro(value, options = {}) {
  const digits = Number.isInteger(options.digits) ? options.digits : 0;
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  }).format(Math.max(0, Number(value) || 0));
}

function formatEuroMonthly(value) {
  return `${formatEuro(value, { digits: 2 })} / mois`;
}

function formatPercent(value) {
  return `${Math.round((Number(value) || 0) * 100)} %`;
}

function getApprenticeRate(age) {
  const numericAge = Math.max(0, Number.parseInt(age, 10) || 0);

  if (numericAge < 18) {
    return {
      rate: 0.27,
      label: 'Moins de 18 ans',
      detail: '1re année : 27 % du SMIC'
    };
  }

  if (numericAge <= 20) {
    return {
      rate: 0.43,
      label: '18 à 20 ans',
      detail: '1re année : 43 % du SMIC'
    };
  }

  if (numericAge <= 25) {
    return {
      rate: 0.53,
      label: '21 à 25 ans',
      detail: '1re année : 53 % du SMIC'
    };
  }

  return {
    rate: 1,
    label: '26 ans et plus',
    detail: 'Rémunération au moins égale au SMIC ou au SMC applicable'
  };
}

function statusLabel(status) {
  return status === 'eligible' ? 'Éligible' : 'À vérifier';
}

function getState(root) {
  const activeValue = (field) => root.querySelector(`.aid-calc-segment.is-active[data-field="${field}"]`)?.dataset.value;
  const fieldValue = (field) => root.querySelector(`[data-aid-field="${field}"]`)?.value || '';

  return {
    companySize: activeValue('companySize') || 'under_250',
    isDisabledApprentice: activeValue('isDisabledApprentice') === 'yes',
    apprenticeAge: Math.max(0, Number.parseInt(fieldValue('apprenticeAge') || '0', 10) || 0),
    smicMonthly: parseFrenchNumber(fieldValue('smicMonthly'), DEFAULT_SMIC_MONTHLY)
  };
}

function calculateAid(state) {
  const apprenticeRate = getApprenticeRate(state.apprenticeAge);
  const smicMonthly = state.smicMonthly > 0 ? state.smicMonthly : DEFAULT_SMIC_MONTHLY;
  const monthlySalary = roundMoney(smicMonthly * apprenticeRate.rate);
  const totalGrossSalary = roundMoney(monthlySalary * REFERENCE_MONTHS);
  const estimatedAid = state.isDisabledApprentice ? DISABLED_APPRENTICE_AID_AMOUNT : STANDARD_AID_AMOUNT;
  const totalRemainder = Math.max(0, roundMoney(totalGrossSalary - estimatedAid));
  const monthlyRemainder = roundMoney(totalRemainder / REFERENCE_MONTHS);

  let status = 'eligible';
  let reason = '';

  if (state.companySize === 'over_250') {
    status = 'a_verifier';
    reason = 'Aide possible sous conditions pour les entreprises de 250 salariés et plus. Une vérification SBI est recommandée.';
  }

  const summary = `Pour un apprenti de ${state.apprenticeAge || '-'} ans : ${formatPercent(apprenticeRate.rate)} du SMIC, soit ${formatEuro(monthlySalary, { digits: 2 })} brut / mois. Aide déduite : ${formatEuro(estimatedAid)}.`;
  const legalWarning = reason;

  const contactMessage = [
    'Bonjour SBI,',
    '',
    "Je souhaite être recontacté au sujet de cette estimation de reste à charge pour un contrat d'apprentissage.",
    '',
    `Âge de l'apprenti : ${state.apprenticeAge || '-'} ans`,
    `Barème appliqué : ${apprenticeRate.label} - ${apprenticeRate.detail}`,
    `Salaire brut mensuel estimé : ${formatEuro(monthlySalary, { digits: 2 })}`,
    `Coût brut annuel estimé : ${formatEuro(totalGrossSalary, { digits: 2 })}`,
    `Aide employeur estimée : ${formatEuro(estimatedAid, { digits: 2 })}`,
    `Reste à charge total estimé* : ${formatEuro(totalRemainder, { digits: 2 })}`,
    `Reste à charge mensuel estimé* : ${formatEuro(monthlyRemainder, { digits: 2 })}`,
    '* Hors charges si applicable.',
    `Statut : ${statusLabel(status)}`,
    '',
    'Merci de vérifier cette estimation avec moi.'
  ].join('\n');

  return {
    estimatedAid,
    status,
    reason,
    summary,
    warning: legalWarning,
    apprenticeRate,
    smicMonthly,
    monthlySalary,
    totalGrossSalary,
    totalRemainder,
    monthlyRemainder,
    contactMessage
  };
}

function updateSegment(button) {
  const group = button.closest('.aid-calc-segmented');
  if (!group) return;

  group.querySelectorAll('.aid-calc-segment[data-field]').forEach((segment) => {
    const active = segment === button;
    segment.classList.toggle('is-active', active);
    segment.setAttribute('aria-pressed', active ? 'true' : 'false');
  });
}

function setText(root, selector, text) {
  const target = root.querySelector(selector);
  if (target) target.textContent = text;
}

function updateResult(root) {
  const state = getState(root);
  const result = calculateAid(state);
  const isEligible = result.status === 'eligible';

  setText(root, '[data-aid-result-amount]', formatEuroMonthly(result.monthlyRemainder));
  setText(root, '[data-aid-result-summary]', result.summary);
  setText(root, '[data-aid-total-cost]', formatEuro(result.totalRemainder, { digits: 2 }));
  setText(root, '[data-aid-monthly-salary]', formatEuro(result.monthlySalary, { digits: 2 }));
  setText(root, '[data-aid-estimated-aid]', formatEuro(result.estimatedAid));
  setText(root, '[data-aid-rate]', formatPercent(result.apprenticeRate.rate));
  setText(root, '[data-aid-status]', statusLabel(result.status));
  setText(root, '[data-aid-error]', result.warning || '');

  const statusNode = root.querySelector('[data-aid-status]');
  if (statusNode) {
    statusNode.classList.toggle('is-eligible', isEligible);
    statusNode.classList.toggle('is-warning', !isEligible);
  }

  const contactLink = root.querySelector('[data-aid-contact-link]');
  if (contactLink) {
    const contactParams = new URLSearchParams({
      motif: 'estimation-aide',
      montant: formatEuro(result.monthlyRemainder, { digits: 2 }),
      montantTotal: formatEuro(result.totalRemainder, { digits: 2 }),
      statut: statusLabel(result.status),
      formation: `Bac / RNCP Niveau ${SBI_RNCP_LEVEL}`,
      message: result.contactMessage
    });
    contactLink.href = `contact.html?${contactParams.toString()}`;
  }

  root.dispatchEvent(new CustomEvent('sbi:aid-calculator:updated', {
    bubbles: true,
    detail: { version: SBI_AID_CALCULATOR_VERSION, state, result }
  }));

  return result;
}

export function initSbiAidCalculator(scope = document) {
  const roots = Array.from(scope.querySelectorAll?.('.sbi-aide-calculator') || []);
  if (!roots.length && scope.classList?.contains('sbi-aide-calculator')) roots.push(scope);

  roots.forEach((root) => {
    if (root.dataset.sbiAidCalculatorReady === SBI_AID_CALCULATOR_VERSION) {
      updateResult(root);
      return;
    }

    root.dataset.sbiAidCalculatorReady = SBI_AID_CALCULATOR_VERSION;

    root.addEventListener('click', (event) => {
      const button = event.target.closest?.('.aid-calc-segment[data-field]');
      if (!button || !root.contains(button)) return;

      updateSegment(button);
      updateResult(root);
    });

    root.addEventListener('input', (event) => {
      if (!event.target.matches?.('[data-aid-field]')) return;
      updateResult(root);
    });

    root.addEventListener('change', (event) => {
      if (!event.target.matches?.('[data-aid-field]')) return;
      updateResult(root);
    });

    const form = root.querySelector('.aid-calc-form');
    form?.addEventListener('submit', (event) => {
      event.preventDefault();
      updateResult(root);
      root.querySelector('.aid-calc-result-card')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    });

    updateResult(root);
  });
}

window.SBI_AID_CALCULATOR_VERSION = SBI_AID_CALCULATOR_VERSION;
window.SBI_INIT_AID_CALCULATOR = initSbiAidCalculator;

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => initSbiAidCalculator(document), { once: true });
} else {
  initSbiAidCalculator(document);
}
