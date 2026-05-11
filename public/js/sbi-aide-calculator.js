const SBI_AID_CALCULATOR_VERSION = '8.0P.67';
const SBI_RNCP_LEVEL = 4;
const DEFAULT_SMIC_MONTHLY = 1823.03;
const STANDARD_AID_AMOUNT = 5000;
const DISABLED_APPRENTICE_AID_AMOUNT = 6000;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

function padDatePart(value) {
  return String(value).padStart(2, '0');
}

function toDateInputValue(date) {
  return `${date.getFullYear()}-${padDatePart(date.getMonth() + 1)}-${padDatePart(date.getDate())}`;
}

function addYearsMinusOneDay(date, years = 1) {
  const next = new Date(date);
  next.setFullYear(next.getFullYear() + years);
  next.setDate(next.getDate() - 1);
  return next;
}

function parseLocalDate(value) {
  if (!value) return null;
  const [year, month, day] = String(value).split('-').map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day);
}

function daysBetween(startDate, endDate) {
  const start = Date.UTC(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
  const end = Date.UTC(endDate.getFullYear(), endDate.getMonth(), endDate.getDate());
  return Math.round((end - start) / ONE_DAY_MS);
}

function isLeapYear(year) {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

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

function formatMonths(value) {
  const months = Number(value) || 0;
  if (Math.abs(months - Math.round(months)) < 0.01) {
    const rounded = Math.max(0, Math.round(months));
    return `${rounded} mois`;
  }
  return `${new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 }).format(months)} mois`;
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

function getDurationInfo(startDate, endDate, nonExecutedDays = 0) {
  if (!startDate || !endDate) {
    return {
      isValid: false,
      contractDays: 0,
      contractMonths: 0,
      aidRatio: 0,
      warning: 'Renseignez les dates du contrat pour calculer le reste à charge.'
    };
  }

  if (endDate < startDate) {
    return {
      isValid: false,
      contractDays: 0,
      contractMonths: 0,
      aidRatio: 0,
      warning: 'La date de fin prévue doit être postérieure au début du contrat.'
    };
  }

  const contractDays = Math.max(1, daysBetween(startDate, endDate) + 1);
  const firstYearEnd = new Date(Math.min(endDate.getTime(), addYearsMinusOneDay(startDate).getTime()));
  const firstYearTheoreticalDays = Math.max(1, daysBetween(startDate, firstYearEnd) + 1);
  const firstYearExecutedDays = Math.max(0, firstYearTheoreticalDays - Math.max(0, nonExecutedDays));
  const referenceDays = isLeapYear(startDate.getFullYear()) ? 366 : 365;
  const contractMonths = Math.max(1, roundMoney((contractDays / referenceDays) * 12));
  const aidRatio = Math.min(1, firstYearExecutedDays / referenceDays);

  return {
    isValid: true,
    contractDays,
    contractMonths,
    aidRatio,
    warning: ''
  };
}

function getState(root) {
  const activeValue = (field) => root.querySelector(`.aid-calc-segment.is-active[data-field="${field}"]`)?.dataset.value;
  const fieldValue = (field) => root.querySelector(`[data-aid-field="${field}"]`)?.value || '';

  return {
    companySize: activeValue('companySize') || 'under_250',
    contractType: activeValue('contractType') || 'apprentissage',
    isDisabledApprentice: activeValue('isDisabledApprentice') === 'yes',
    apprenticeAge: Math.max(0, Number.parseInt(fieldValue('apprenticeAge') || '0', 10) || 0),
    smicMonthly: parseFrenchNumber(fieldValue('smicMonthly'), DEFAULT_SMIC_MONTHLY),
    signatureDate: fieldValue('signatureDate'),
    contractStartDate: fieldValue('contractStartDate'),
    contractEndDate: fieldValue('contractEndDate'),
    nonExecutedDays: Math.max(0, Number.parseInt(fieldValue('nonExecutedDays') || '0', 10) || 0)
  };
}

function calculateAid(state) {
  const startDate = parseLocalDate(state.contractStartDate);
  const endDate = parseLocalDate(state.contractEndDate);
  const duration = getDurationInfo(startDate, endDate, state.nonExecutedDays);
  const apprenticeRate = getApprenticeRate(state.apprenticeAge);
  const smicMonthly = state.smicMonthly > 0 ? state.smicMonthly : DEFAULT_SMIC_MONTHLY;
  const monthlySalary = roundMoney(smicMonthly * apprenticeRate.rate);
  const totalGrossSalary = roundMoney(monthlySalary * duration.contractMonths);

  let baseAid = 0;
  let status = 'eligible';
  let reason = '';

  if (state.contractType !== 'apprentissage') {
    status = 'hors_simulateur';
    reason = "Ce simulateur concerne les contrats d'apprentissage. Pour un contrat de professionnalisation, les règles peuvent différer.";
  } else {
    baseAid = state.isDisabledApprentice ? DISABLED_APPRENTICE_AID_AMOUNT : STANDARD_AID_AMOUNT;

    if (state.companySize === 'over_250') {
      status = 'a_verifier';
      reason = 'Aide possible sous conditions pour les entreprises de 250 salariés et plus. Une vérification SBI est recommandée.';
    }
  }

  const estimatedAid = duration.isValid && baseAid > 0
    ? roundMoney(baseAid * duration.aidRatio)
    : 0;
  const totalRemainder = duration.isValid
    ? Math.max(0, roundMoney(totalGrossSalary - estimatedAid))
    : 0;
  const monthlyRemainder = duration.isValid && duration.contractMonths > 0
    ? roundMoney(totalRemainder / duration.contractMonths)
    : 0;

  const summary = duration.isValid
    ? `Pour un apprenti de ${state.apprenticeAge || '-'} ans : ${formatPercent(apprenticeRate.rate)} du SMIC, soit ${formatEuro(monthlySalary, { digits: 2 })} brut / mois. Aide déduite : ${formatEuro(estimatedAid)}.`
    : duration.warning;

  const legalWarning = [duration.warning, reason].filter(Boolean).join(' ');
  const contactMessage = [
    'Bonjour SBI,',
    '',
    "Je souhaite être recontacté au sujet de cette estimation de reste à charge pour un contrat d'apprentissage.",
    '',
    `Âge de l'apprenti : ${state.apprenticeAge || '-'} ans`,
    `Barème appliqué : ${apprenticeRate.label} - ${apprenticeRate.detail}`,
    `SMIC brut mensuel retenu : ${formatEuro(smicMonthly, { digits: 2 })}`,
    `Durée du contrat retenue : ${formatMonths(duration.contractMonths)} (${duration.contractDays || 0} jours)`,
    `Salaire brut mensuel estimé : ${formatEuro(monthlySalary, { digits: 2 })}`,
    `Coût brut total estimé : ${formatEuro(totalGrossSalary, { digits: 2 })}`,
    `Aide employeur estimée : ${formatEuro(estimatedAid, { digits: 2 })}`,
    `Reste à charge total estimé : ${formatEuro(totalRemainder, { digits: 2 })}`,
    `Reste à charge mensuel estimé : ${formatEuro(monthlyRemainder, { digits: 2 })}`,
    `Statut : ${statusLabel(status)}`,
    '',
    'Merci de vérifier cette estimation avec moi.'
  ].join('\n');

  return {
    baseAid,
    estimatedAid,
    aidRatio: duration.aidRatio,
    status,
    reason,
    summary,
    dateWarning: legalWarning,
    apprenticeRate,
    smicMonthly,
    monthlySalary,
    totalGrossSalary,
    totalRemainder,
    monthlyRemainder,
    contractMonths: duration.contractMonths,
    contractDays: duration.contractDays,
    contactMessage
  };
}

function statusLabel(status) {
  if (status === 'eligible') return 'Éligible';
  if (status === 'hors_simulateur') return 'Hors simulateur';
  return 'À vérifier';
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
  const isCalculable = result.status !== 'hors_simulateur' && result.contractMonths > 0;

  setText(root, '[data-aid-result-amount]', isCalculable ? formatEuroMonthly(result.monthlyRemainder) : 'À vérifier');
  setText(root, '[data-aid-result-summary]', result.summary);
  setText(root, '[data-aid-total-cost]', isCalculable ? formatEuro(result.totalRemainder, { digits: 2 }) : 'À vérifier');
  setText(root, '[data-aid-monthly-salary]', formatEuro(result.monthlySalary, { digits: 2 }));
  setText(root, '[data-aid-estimated-aid]', formatEuro(result.estimatedAid));
  setText(root, '[data-aid-contract-duration]', formatMonths(result.contractMonths));
  setText(root, '[data-aid-rate]', formatPercent(result.apprenticeRate.rate));
  setText(root, '[data-aid-status]', statusLabel(result.status));
  setText(root, '[data-aid-error]', result.dateWarning || '');

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

function applyDefaultDates(root) {
  const signatureInput = root.querySelector('[data-aid-field="signatureDate"]');
  const startInput = root.querySelector('[data-aid-field="contractStartDate"]');
  const endInput = root.querySelector('[data-aid-field="contractEndDate"]');
  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const end = addYearsMinusOneDay(start);

  if (signatureInput && !signatureInput.value) signatureInput.value = toDateInputValue(today);
  if (startInput && !startInput.value) startInput.value = toDateInputValue(start);
  if (endInput && !endInput.value) endInput.value = toDateInputValue(end);
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
    applyDefaultDates(root);

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
