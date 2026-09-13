import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  assertIndependentPracticeQuestions,
  parsePracticeBankDraft,
  questionSimilarity,
} from "../src/lib/practiceContent.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const jsonRoot = path.resolve(root, "..", "output", "json");
const output = path.join(jsonRoot, "practice-session-02-expanded");
const privateFile = path.join(jsonRoot, "Hamad_CFA_Level_I_Session_02_Private_Playbook.json");
const existingFile = path.join(jsonRoot, "Hamad_CFA_Level_I_Session_02_Independent_Practice.json");
const contexts = [
  "While reviewing a multi-asset mandate",
  "During an investment committee challenge",
  "When validating a junior analyst's worksheet",
  "In a time-constrained examination item",
  "Before relying on the result in a portfolio decision",
];

function rotate(options, correct, amount) {
  const shift = amount % options.length;
  const rotated = [...options.slice(shift), ...options.slice(0, shift)];
  return { options: rotated, correctOption: (correct - shift + options.length) % options.length };
}

function makeQuestion(moduleId, definition, variant, answerOffset = 0) {
  const [slug, type, core, correct, wrongOne, wrongTwo, explanation, formula, trap, tag] = definition;
  const ordered = rotate([correct, wrongOne, wrongTwo], 0, variant + answerOffset);
  return {
    id: `${moduleId}-${slug}-${variant + 1}`,
    moduleId,
    conceptId: `${moduleId}-${slug}`,
    type,
    difficulty: Math.min(5, 2 + Math.floor(variant / 2)),
    estimatedSeconds: type === "calculation" ? 105 + variant * 15 : 65 + variant * 10,
    prompt: `${contexts[variant]}, ${core}`,
    options: ordered.options,
    correctOption: ordered.correctOption,
    explanation,
    working: type === "calculation"
      ? [
          "Identify the estimand or portfolio quantity and align all units.",
          formula ? `Apply ${formula}.` : "Apply the governing statistical relation.",
          "Check admissibility, then interpret the result for the investment decision.",
        ]
      : [],
    formulae: formula ? [formula] : [],
    distractorExplanations: ordered.options.map(option => option === correct
      ? "This choice follows the stated assumptions and the governing quantitative relation."
      : "This choice changes the estimator, conditioning information, risk measure, or decision rule."),
    examTrap: trap,
    tags: [tag],
  };
}

const modules = [
  {
    id: "m005-statistics", code: "M005", title: "Statistical Characteristics of Asset Returns",
    definitions: [
      ["weighted-location", "calculation", "scenario returns of -4%, 6%, and 14% have probabilities 20%, 50%, and 30%. What weighted mean return is correct?", "6.40%", "5.33%", "16.00%", "The probability-weighted mean is 0.20(-4%) + 0.50(6%) + 0.30(14%) = 6.40%.", "Weighted mean = sum(wi xi)", "Weights must remain attached to their corresponding observations and sum to one.", "weighted-mean"],
      ["robust-location", "concept", "a return sample contains one extreme positive observation. Which statistic best preserves a representative central location?", "Median", "Arithmetic mean", "Range", "The median is determined by rank and is substantially less sensitive to the magnitude of an extreme observation.", "", "Robustness to an outlier does not mean that the statistic uses every observation's magnitude.", "robust-location"],
      ["percentile", "calculation", "using the position rule L = (n + 1)p, eight ordered returns are observed and the 25th percentile is requested. Which position is used?", "2.25", "2.00", "2.50", "The stated rule gives L = (8 + 1)(0.25) = 2.25, so interpolation occurs between the second and third observations.", "L = (n + 1)p", "A percentile answer depends on the interpolation convention stated in the question.", "percentile"],
      ["sample-variance", "calculation", "sample returns are 2%, 5%, and 8%. What sample variance in squared percentage-point units is correct?", "9.00", "6.00", "18.00", "The mean is 5%; squared deviations sum to 18, and division by n - 1 = 2 gives 9.", "s^2 = sum((xi - xbar)^2) / (n - 1)", "Use n - 1 for a sample variance estimate and state the squared units.", "sample-variance"],
      ["coefficient-variation", "calculation", "a strategy has a mean return of 6% and standard deviation of 9%. What coefficient of variation should be reported?", "1.50", "0.67", "15.00", "The coefficient of variation is 9% / 6% = 1.50 units of risk per unit of mean return.", "CV = standard deviation / mean", "The coefficient of variation becomes unstable or economically misleading when the mean is near zero or negative.", "coefficient-of-variation"],
      ["target-semideviation", "concept", "an investor defines downside as returns below 2%, rather than below the sample mean. Which measure addresses that objective?", "Target semideviation around 2%", "Ordinary standard deviation", "Interquartile range", "Target semideviation measures dispersion of observations falling below the investor's specified minimum acceptable return.", "Target semivariance = sum[min(0, Ri - B)^2] / denominator", "Do not silently replace the stated downside threshold with the arithmetic mean.", "target-semideviation"],
      ["shape", "concept", "a distribution has a long left tail and excess kurtosis greater than zero. Which risk description is most accurate?", "Negative skewness with greater tail risk than a normal distribution", "Positive skewness with thinner tails", "Symmetry with no extreme-outcome implication", "A long left tail indicates negative skewness; positive excess kurtosis indicates more mass in the tails relative to the normal benchmark.", "Excess kurtosis = kurtosis - 3", "Kurtosis concerns tail weight, not merely the height of the distribution's peak.", "skewness-kurtosis"],
      ["covariance", "calculation", "two assets have correlation -0.40 and standard deviations 12% and 18%. What covariance is correct in decimal-return units?", "-0.00864", "-0.08640", "0.00864", "Covariance is (-0.40)(0.12)(0.18) = -0.00864.", "Cov(X,Y) = rho(X,Y) sigmaX sigmaY", "Convert percentage volatilities to decimals before calculating decimal-return covariance.", "covariance"],
      ["correlation-transform", "concept", "all returns for one asset are converted from decimals to percentages while the other series is unchanged. What happens to correlation?", "It is unchanged", "It is multiplied by 100", "It is divided by 100", "A positive linear rescaling changes covariance and standard deviation proportionally, leaving their standardized ratio unchanged.", "rho = Cov(X,Y) / (sigmaX sigmaY)", "Correlation is unit-free; covariance is not.", "correlation-transformation"],
      ["dependence", "concept", "two return series have zero sample correlation. Which conclusion is justified?", "No linear association is detected in the sample", "The returns are statistically independent", "Their covariance matrix is necessarily invalid", "Zero correlation rules out measured linear association, but nonlinear dependence may remain.", "", "Independence generally implies zero correlation when moments exist; zero correlation does not generally imply independence.", "zero-correlation"],
    ],
  },
  {
    id: "m006-distributions", code: "M006", title: "Statistical Distributions for Financial Asset Prices and Returns",
    definitions: [
      ["conditional-probability", "calculation", "P(A and B) is 0.18 and P(B) is 0.30. What is P(A given B)?", "0.60", "0.054", "0.48", "Conditional probability is 0.18 / 0.30 = 0.60.", "P(A|B) = P(A and B) / P(B)", "The denominator is the probability of the conditioning event.", "conditional-probability"],
      ["bayes", "calculation", "a warning occurs in 80% of stressed regimes and 10% of normal regimes; the prior stress probability is 20%. What posterior stress probability follows after a warning?", "66.67%", "16.00%", "44.44%", "P(warning) = 0.80(0.20) + 0.10(0.80) = 0.24; Bayes' formula gives 0.16/0.24 = 66.67%.", "P(S|W) = P(W|S)P(S) / P(W)", "Include both stressed and normal routes to the observed warning.", "bayes-rule"],
      ["discrete-moments", "calculation", "a payoff is 0 with probability 0.70 and 100 with probability 0.30. What expected payoff is correct?", "30", "50", "70", "The probability-weighted expected payoff is 0(0.70) + 100(0.30) = 30.", "E(X) = sum(pi xi)", "An expected value is probability weighted; it need not be a possible realized payoff.", "expected-value"],
      ["total-variance", "concept", "returns vary within each economic regime and regime means also differ. Which variance decomposition is complete?", "Expected conditional variance plus variance of conditional means", "Only expected conditional variance", "Only variance of conditional means", "The law of total variance incorporates uncertainty both within regimes and between regime-specific means.", "Var(X) = E[Var(X|Y)] + Var(E[X|Y])", "Ignoring between-regime variation understates unconditional risk.", "total-variance"],
      ["binomial", "calculation", "a bond defaults independently with probability 5% in each of four comparable trials. What is the probability of exactly one default?", "17.15%", "20.00%", "81.45%", "The binomial probability is C(4,1)(0.05)(0.95)^3 = 17.15%.", "P(X=x) = C(n,x)p^x(1-p)^(n-x)", "Verify the fixed-trial, constant-probability, binary-outcome, and independence assumptions.", "binomial"],
      ["uniform", "calculation", "a continuously uniform return lies between -6% and 10%. What is the probability that it is below 2%?", "50.00%", "20.00%", "80.00%", "The interval from -6% to 2% has width 8 percentage points out of a total width of 16, giving 50%.", "P(a <= X <= x) = (x - a) / (b - a)", "For a continuous distribution, probability is interval length divided by total support length.", "continuous-uniform"],
      ["normal-tail", "calculation", "a normal return has mean 7% and standard deviation 5%. What z-score corresponds to a return of -3%?", "-2.00", "-0.80", "2.00", "Standardization gives (-3% - 7%) / 5% = -2.00.", "z = (x - mu) / sigma", "Retain the sign: an observation below the mean has a negative z-score.", "normal-standardization"],
      ["normal-quantile", "concept", "a one-tailed 5% loss quantile is reported for a normal return distribution. What does it represent?", "A threshold exceeded on the loss side with 5% probability", "The expected loss conditional on being in the worst 5%", "A loss that occurs exactly 5% of the time", "A quantile identifies a cutoff, not the average severity beyond that cutoff.", "q0.05 = mu + z0.05 sigma", "Do not confuse a tail quantile with expected shortfall.", "normal-quantile"],
      ["lognormal", "concept", "continuously compounded returns are normally distributed. Which statement about the corresponding terminal price is correct?", "It is positive and lognormally distributed", "It is normally distributed and may be negative", "Its mean must equal its median", "Exponentiating a normal log return produces a strictly positive, right-skewed lognormal price.", "ST = S0 exp(Rcc)", "Normality of log returns does not imply normality of price levels.", "lognormal-price"],
      ["joint-model", "concept", "an analyst knows two marginal default probabilities but not their dependence. Can the probability of both defaults be determined uniquely?", "No, a joint model or dependence assumption is required", "Yes, multiply the marginals in every case", "Yes, add the marginals", "Marginal probabilities alone do not determine a joint probability unless an assumption such as independence is supplied.", "P(A and B) = P(A|B)P(B)", "Multiplying marginal probabilities silently assumes independence.", "joint-distribution"],
    ],
  },
  {
    id: "m007-inference", code: "M007", title: "Estimation and Hypothesis Testing",
    definitions: [
      ["sampling-design", "concept", "a small bond sector must be represented precisely despite being a minor share of the population. Which probability design is most suitable?", "Stratified random sampling", "Convenience sampling", "Simple cluster sampling", "Stratification permits deliberate representation within defined subgroups while retaining probability selection within each stratum.", "", "Stratified sampling draws from every stratum; cluster sampling selects groups and observes units within selected groups.", "stratified-sampling"],
      ["standard-error", "calculation", "population standard deviation is 12 and a random sample contains 36 observations. What is the standard error of the sample mean?", "2.00", "0.33", "12.00", "The standard error is 12 / sqrt(36) = 2.", "SE(xbar) = sigma / sqrt(n)", "Standard error describes sampling variability of an estimator, not dispersion of individual observations.", "standard-error"],
      ["known-sigma-ci", "calculation", "a sample mean is 8%, population sigma is 6%, n is 36, and the 95% z critical value is 1.96. Which confidence interval is correct?", "6.04% to 9.96%", "2.00% to 14.00%", "7.67% to 8.33%", "The standard error is 1%; the margin is 1.96%, producing 8% plus or minus 1.96%.", "xbar +/- z(alpha/2) sigma/sqrt(n)", "Use the critical value for the specified confidence level and the standard error, not population sigma alone.", "confidence-interval"],
      ["unknown-sigma", "concept", "population variance is unknown and a small normally distributed sample is used to estimate a mean. Which reference distribution is appropriate?", "Student's t distribution with n - 1 degrees of freedom", "Standard normal distribution regardless of sample size", "Chi-square distribution for the mean", "Replacing unknown sigma with sample standard deviation introduces estimation uncertainty captured by the t distribution.", "t = (xbar - mu0) / (s/sqrt(n))", "Degrees of freedom and tail count must match the test design.", "t-distribution"],
      ["sample-size", "calculation", "sigma is 15, desired 95% margin of error is 3, and z is 1.96. What minimum sample size is required?", "97", "96", "25", "The unrounded requirement is (1.96 x 15 / 3)^2 = 96.04, which must be rounded up to 97.", "n = (z sigma / E)^2", "Always round a required sample size upward.", "sample-size"],
      ["bootstrap", "concept", "an analyst repeatedly resamples the observed data with replacement and computes the estimator each time. What is being estimated from the replicate dispersion?", "The estimator's sampling uncertainty", "The population parameter with certainty", "The investment's realized volatility only", "Bootstrap replicate dispersion approximates the sampling distribution and therefore the estimator's standard error or uncertainty.", "", "A bootstrap inherits weaknesses in the original sample and does not eliminate dependence automatically.", "bootstrap-inference"],
      ["test-decision", "calculation", "a two-sided z test produces z = 2.20 at a 5% significance level with critical values plus or minus 1.96. What decision is correct?", "Reject the null hypothesis", "Fail to reject the null hypothesis", "Accept the alternative as economically important", "Because |2.20| exceeds 1.96, the test rejects the null at 5%; economic materiality requires a separate assessment.", "Reject H0 when |test statistic| > critical value", "Statistical significance does not establish economic significance or causation.", "hypothesis-decision"],
      ["errors-power", "concept", "holding the true effect and sample size fixed, the significance level is reduced from 5% to 1%. What generally happens?", "Type I error probability falls and Type II error probability rises", "Both error probabilities necessarily fall", "Power necessarily rises", "A stricter rejection threshold lowers false-rejection risk but makes rejection under a real effect more difficult, reducing power all else equal.", "Power = 1 - beta", "Changing alpha creates a trade-off unless sample size or effect size also changes.", "type-errors-power"],
      ["paired-test", "concept", "the same portfolios are measured before and after a process change. Which mean-comparison structure is appropriate?", "A paired test applied to portfolio-level differences", "An independent pooled-variance test", "An F test of two variances", "The observations are naturally matched, so inference should be based on the within-portfolio difference series.", "td = dbar / (sd/sqrt(n))", "Treating paired observations as independent discards the matching information.", "paired-test"],
      ["nonparametric", "concept", "two variables are ordinal ranks with ties and the analyst wants to test monotonic association. Which measure is most suitable?", "Spearman rank correlation with tie-adjusted ranks", "Pearson covariance on the category labels", "A one-sample variance test", "Spearman correlation evaluates monotonic association using ranks and accommodates ties through appropriate average ranks.", "rs = correlation of ranks", "Nonparametric methods still have assumptions and require the correct null distribution or approximation.", "spearman-rank"],
    ],
  },
  {
    id: "m008-portfolio", code: "M008", title: "The Return and Risk of a Financial Portfolio",
    definitions: [
      ["portfolio-return", "calculation", "a fully invested portfolio places 35% in an asset returning 4% and 65% in an asset returning 10%. What portfolio return results?", "7.90%", "7.00%", "14.00%", "Portfolio return is 0.35(4%) + 0.65(10%) = 7.90%.", "Rp = sum(wi Ri)", "Match every weight to its asset and verify that fully invested weights sum to one.", "portfolio-return"],
      ["covariance-input", "calculation", "asset volatilities are 10% and 20% with correlation 0.25. What covariance in decimal-return units is correct?", "0.0050", "0.0500", "0.2500", "Covariance is 0.25(0.10)(0.20) = 0.0050.", "Cov12 = rho12 sigma1 sigma2", "Portfolio variance requires covariance, not correlation alone.", "portfolio-covariance"],
      ["two-asset-risk", "calculation", "weights are 60% and 40%, volatilities are 10% and 15%, and correlation is zero. What portfolio standard deviation is closest?", "8.49%", "10.50%", "12.00%", "Variance is (0.60^2)(0.10^2) + (0.40^2)(0.15^2) = 0.0072; its square root is 8.49%.", "sigmaP^2 = w1^2 sigma1^2 + w2^2 sigma2^2 + 2w1w2Cov12", "Zero correlation removes the covariance term but does not eliminate individual asset variance.", "portfolio-variance"],
      ["perfect-negative", "calculation", "two assets have volatilities 12% and 18% and correlation -1. What weight in the first asset creates a zero-variance portfolio?", "60%", "40%", "50%", "With perfect negative correlation, set w1 sigma1 = (1 - w1) sigma2; w1 = 18/(12 + 18) = 60%.", "w1 = sigma2 / (sigma1 + sigma2) when rho = -1", "A zero-variance combination requires perfect negative correlation and the matching volatility weights.", "perfect-negative-correlation"],
      ["minimum-variance", "concept", "a candidate portfolio lies below the global minimum-variance portfolio on the minimum-variance frontier. How should it be classified?", "Inefficient because another portfolio offers higher expected return for the same risk", "Efficient because it has low expected return", "Unattainable by definition", "The efficient frontier is the upper segment beginning at the global minimum-variance portfolio; the lower segment is dominated.", "", "Minimum variance and efficiency are related but not synonymous for every frontier portfolio.", "efficient-frontier"],
      ["utility", "calculation", "expected return is 10%, variance is 0.0225, and risk aversion A is 4. Using U = E(R) - 0.5A variance, what utility results?", "5.50%", "1.00%", "7.75%", "Utility is 0.10 - 0.5(4)(0.0225) = 0.055, or 5.50%.", "U = E(R) - 0.5 A sigma^2", "Use variance rather than standard deviation in mean-variance utility.", "mean-variance-utility"],
      ["cal-slope", "calculation", "a risky portfolio returns 11% with volatility 16% and the risk-free rate is 3%. What is the capital allocation line slope?", "0.50", "0.69", "0.08", "The CAL slope is (11% - 3%) / 16% = 0.50, the risky portfolio's Sharpe ratio.", "CAL slope = [E(RP) - Rf] / sigmaP", "Subtract the risk-free rate before dividing by total risk.", "capital-allocation-line"],
      ["optimal-allocation", "calculation", "a risky portfolio has expected return 9%, variance 0.04, the risk-free rate is 3%, and risk aversion is 3. What optimal risky weight follows?", "50%", "75%", "150%", "The optimal risky allocation is (0.09 - 0.03)/(3 x 0.04) = 0.50.", "y* = [E(RP) - Rf] / (A sigmaP^2)", "The denominator contains variance and risk aversion; weights above one imply leverage.", "optimal-risky-allocation"],
      ["borrowing-rate", "concept", "the investor's borrowing rate exceeds the lending rate. What happens to the capital allocation opportunity set beyond 100% in the risky portfolio?", "Its slope becomes lower because leveraged exposure is financed at the higher borrowing rate", "It remains one straight line with the lending-rate slope", "It becomes risk free", "A borrowing-lending spread creates a kink; leveraged combinations use the borrowing rate and therefore a lower reward-to-risk slope.", "Leveraged CAL slope = [E(RP) - Rborrow] / sigmaP", "Do not extend the lending-rate CAL through leveraged allocations when borrowing is more expensive.", "borrowing-lending-spread"],
      ["safety-first", "calculation", "a portfolio has expected return 8%, minimum acceptable return 2%, and standard deviation 10%. What is Roy's safety-first ratio?", "0.60", "0.80", "1.00", "The ratio is (8% - 2%) / 10% = 0.60; a higher value implies lower normal-model shortfall probability.", "SFRatio = [E(RP) - RL] / sigmaP", "The threshold is the minimum acceptable return, not the risk-free rate unless explicitly stated.", "safety-first"],
    ],
  },
  {
    id: "m009-simulation", code: "M009", title: "Simulation of Financial Asset Prices and Returns",
    definitions: [
      ["method-choice", "concept", "an analyst wants scenarios that retain the empirical marginal distribution without imposing normality. Which starting method is most direct?", "Historical simulation", "A normal parametric simulation", "A deterministic single forecast", "Historical simulation reuses observed outcomes and therefore retains their empirical distribution within the available sample.", "", "Historical simulation is still limited by sample relevance and may omit events not observed historically.", "historical-simulation"],
      ["bootstrap", "concept", "what distinguishes a standard nonparametric bootstrap from simply replaying the historical series once?", "It samples observed rows with replacement to create many pseudo-samples", "It fits a normal distribution to observed returns", "It guarantees preservation of serial dependence", "Sampling with replacement creates repeated pseudo-samples and an empirical distribution of the statistic of interest.", "", "An ordinary row bootstrap does not preserve time dependence unless the resampling design is modified.", "bootstrap"],
      ["workflow", "concept", "which sequence is most defensible for a Monte Carlo investment analysis?", "Specify model and parameters, generate shocks, map outcomes, calculate decision metrics, validate", "Generate outputs, then choose assumptions that fit them", "Select one favorable path and report it", "A defensible simulation makes the data-generating process explicit before generating outcomes and validates both inputs and outputs.", "", "Simulation volume cannot repair a misspecified economic model.", "monte-carlo-workflow"],
      ["correlated-shocks", "concept", "independent standard normal draws must be converted into shocks with a target covariance matrix. Which operation is commonly used?", "Multiply by a Cholesky factor of the covariance matrix", "Add the target correlations directly to every draw", "Sort all simulated returns identically", "If LL' equals the covariance matrix, multiplying independent standard normals by L produces the target covariance structure.", "epsilon = Lz, where LL' = Sigma", "The target covariance matrix must be positive semidefinite.", "correlated-simulation"],
      ["lognormal-path", "calculation", "a one-period log-price model is ST = 100 exp(0.04 + 0.20z). If z = -0.5, what terminal price is closest?", "94.18", "97.04", "107.25", "The exponent is 0.04 + 0.20(-0.5) = -0.06; 100e^-0.06 is approximately 94.18.", "ST = S0 exp(mu + sigma z)", "Apply the shock inside the exponent and preserve the distinction between log return and simple return.", "lognormal-simulation"],
      ["seed", "concept", "why should a simulation's pseudo-random seed be recorded during model validation?", "It permits exact reproduction of the generated sequence", "It eliminates model risk", "It guarantees independent economic observations", "A fixed seed makes debugging and comparison reproducible; it does not improve the economic assumptions.", "", "Reproducibility is not evidence that the model is correctly specified.", "random-seed"],
      ["mc-error", "calculation", "a Monte Carlo estimate has standard deviation 12 across independent paths and uses 3,600 paths. What standard error is implied?", "0.20", "2.00", "12.00", "Monte Carlo standard error is 12 / sqrt(3,600) = 0.20.", "Monte Carlo SE = simulated SD / sqrt(M)", "Precision improves with the square root of the number of independent paths, not proportionally with path count.", "simulation-error"],
      ["risk-neutral", "concept", "a derivative is valued by discounting expected simulated payoffs under risk-neutral probabilities. Which input is not generally the asset's real-world expected return?", "The risk-neutral drift", "The payoff function", "The contractual maturity", "Risk-neutral valuation adjusts probabilities or drift for pricing consistency; it is not a forecast of the asset's real-world expected return.", "Value = discounted risk-neutral expected payoff", "Do not use a pricing measure as an unqualified forecast distribution.", "risk-neutral-simulation"],
      ["path-dependence", "concept", "a barrier option's payoff depends on whether price crossed a threshold before maturity. What simulation output must be retained?", "The relevant path history, not only terminal price", "Only the mean terminal price", "Only the random seed", "Path-dependent payoffs require monitoring intermediate simulated values because identical terminal prices can arise from different barrier histories.", "", "Terminal-state simulation is insufficient when the contract depends on the route taken.", "path-dependence"],
      ["validation", "concept", "a simulated loss model systematically understates clustered volatility observed in actual markets. What is the primary diagnosis?", "Model risk from a misspecified data-generating process", "Monte Carlo sampling error only", "A benefit of using more paths", "If the assumed process omits volatility clustering, more simulations converge more precisely to the wrong model-implied distribution.", "", "Separate parameter uncertainty, sampling error, implementation error, and structural model risk.", "simulation-model-risk"],
    ],
  },
];

function promptsFromPlaybook(file) {
  const playbook = JSON.parse(fs.readFileSync(file, "utf8"));
  return playbook.chunks.flatMap(chunk => chunk.stages ?? [])
    .flatMap(stage => stage.cards ?? [])
    .flatMap(card => [card.prompt, ...(card.ask ?? [])]).filter(Boolean);
}

const privatePrompts = promptsFromPlaybook(privateFile);
const existingBank = JSON.parse(fs.readFileSync(existingFile, "utf8"));
const existingPrompts = existingBank.questions.map(question => question.prompt);
fs.mkdirSync(output, { recursive: true });

const report = [];
for (const module of modules) {
  if (module.definitions.length !== 10) {
    throw new Error(`${module.id} must define exactly 10 learning objectives.`);
  }
  const questions = module.definitions.flatMap((definition, definitionIndex) =>
    contexts.map((_, variant) => makeQuestion(module.id, definition, variant, definitionIndex))
  );
  const bank = parsePracticeBankDraft({
    schemaVersion: 1,
    id: `session-02-${module.id}-expanded`,
    version: "s02-2026-09-13-v2",
    title: `Session 02 | ${module.code} ${module.title}`,
    topic: module.title,
    moduleIds: [module.id],
    sourceSessionIds: ["session-02"],
    questions,
  });
  assertIndependentPracticeQuestions(bank, [...privatePrompts, ...existingPrompts]);
  const maximumSessionSimilarity = Math.max(...questions.flatMap(question =>
    privatePrompts.map(prompt => questionSimilarity(question.prompt, prompt))
  ));
  const maximumExistingPracticeSimilarity = Math.max(...questions.flatMap(question =>
    existingPrompts.map(prompt => questionSimilarity(question.prompt, prompt))
  ));
  const correctOptionDistribution = [0, 1, 2].map(option =>
    questions.filter(question => question.correctOption === option).length
  );
  const filename = `Hamad_CFA_Level_I_Session_02_${module.code}_Expanded_Practice.json`;
  fs.writeFileSync(path.join(output, filename), `${JSON.stringify(bank, null, 2)}\n`);
  report.push({
    moduleId: module.id,
    file: filename,
    questions: questions.length,
    learningObjectives: module.definitions.length,
    correctOptionDistribution,
    maximumSessionSimilarity: Number(maximumSessionSimilarity.toFixed(3)),
    maximumExistingPracticeSimilarity: Number(maximumExistingPracticeSimilarity.toFixed(3)),
  });
}

const allPrompts = modules.flatMap(module => module.definitions.flatMap((definition, definitionIndex) =>
  contexts.map((_, variant) => makeQuestion(module.id, definition, variant, definitionIndex).prompt)
));
let maximumCrossBankSimilarity = 0;
for (let left = 0; left < allPrompts.length; left += 1) {
  for (let right = left + 1; right < allPrompts.length; right += 1) {
    maximumCrossBankSimilarity = Math.max(
      maximumCrossBankSimilarity,
      questionSimilarity(allPrompts[left], allPrompts[right]),
    );
  }
}
if (allPrompts.length !== 250 || new Set(allPrompts).size !== 250) {
  throw new Error("Session 02 expansion must contain exactly 250 unique prompts.");
}
if (maximumCrossBankSimilarity >= 0.88) {
  throw new Error(`Cross-bank near-duplicate detected (${maximumCrossBankSimilarity.toFixed(3)}).`);
}

fs.writeFileSync(path.join(output, "Session_02_Expanded_Practice_QA_Report.json"), `${JSON.stringify({
  generatedAt: new Date().toISOString(),
  expectedQuestionsPerModule: 50,
  expectedTotalQuestions: 250,
  sessionSimilarityThreshold: 0.68,
  internalNearDuplicateThreshold: 0.88,
  maximumCrossBankSimilarity: Number(maximumCrossBankSimilarity.toFixed(3)),
  tutorOnlyFields: 0,
  banks: report,
}, null, 2)}\n`);

console.log(report.map(item =>
  `${item.moduleId}: ${item.questions} questions; max Session Mode similarity ${item.maximumSessionSimilarity}; max original-practice similarity ${item.maximumExistingPracticeSimilarity}`
).join("\n"));
