import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  assertIndependentPracticeQuestions,
  parsePracticeBankDraft,
  questionSimilarity,
} from "../src/lib/practiceContent.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.resolve(root, "..", "output", "json");
const stamp = "2026-09-12-v1";

function q(moduleId, id, prompt, options, correctOption, explanation, formulae = [], tags = []) {
  return {
    id, moduleId, conceptId: tags[0] ?? id, type: formulae.length ? "calculation" : "concept",
    difficulty: 3, estimatedSeconds: formulae.length ? 120 : 75, prompt, options,
    correctOption, explanation, working: formulae.length ? ["Identify the required measure and align the units.", "Substitute only after writing the governing relation.", "Interpret the result in the context of the decision."] : [],
    formulae, distractorExplanations: options.map((_, index) => index === correctOption ? "This choice applies the governing concept and matches the stated decision." : "This choice applies a different measure, direction, or assumption than the facts support."),
    examTrap: "Define the measure, horizon, and units before selecting a formula or conclusion.", tags,
  };
}

const specifications = [
  {
    session: 1, id: "session-01-independent-practice", title: "Session 01 | Independent quantitative foundations", topic: "Quantitative Methods",
    modules: ["m001-returns", "m002-benchmarking", "m003-return-types", "m004-tvm-valuation", "m004-no-arbitrage", "m005-statistics"],
    questions: [
      q("m001-returns", "s1p-r01", "A share rises from 48 to 51 while paying a 1.20 dividend. What is its holding-period return?", ["6.25%", "8.75%", "11.25%"], 1, "The gain is 3 and income is 1.20; 4.20 divided by 48 equals 8.75%.", ["HPR = (P1 - P0 + D1) / P0"], ["holding-period-return"]),
      q("m001-returns", "s1p-r02", "An asset earns +18% and then -10% with no external cash flows. Which statement is most accurate?", ["Cumulative return is 8.0%", "Cumulative return is 6.2%", "Cumulative return is 4.0%"], 1, "Wealth compounds to 1.18 × 0.90 = 1.062, so cumulative return is 6.2%.", ["Cumulative return = product(1 + Rt) - 1"], ["geometric-linking"]),
      q("m001-returns", "s1p-r03", "A portfolio receives a large contribution immediately before its best month. Which measure best isolates the manager's investment performance?", ["Money-weighted return", "Time-weighted return", "Holding-period income yield"], 1, "Time-weighted return neutralizes external cash-flow timing and is therefore appropriate for manager evaluation.", [], ["time-weighted-return"]),
      q("m002-benchmarking", "s1p-b01", "A mandate requires a 3% real return when expected inflation is 2%. Using the exact Fisher relation, the nominal required return is closest to:", ["4.94%", "5.00%", "5.06%"], 2, "The exact nominal rate is 1.03 × 1.02 - 1 = 5.06%.", ["1 + nominal = (1 + real)(1 + inflation)"], ["fisher-relation"]),
      q("m002-benchmarking", "s1p-b02", "A portfolio returns 9.4% against a benchmark return of 7.1%. Its active return is:", ["2.3%", "7.1%", "16.5%"], 0, "Active return is portfolio return minus benchmark return: 2.3%.", ["Active return = Rp - Rb"], ["active-return"]),
      q("m002-benchmarking", "s1p-b03", "Which benchmark property is violated when constituents and weights cannot be observed before evaluation?", ["Measurability", "Unambiguity", "Appropriateness"], 1, "A benchmark is unambiguous only when its identities and weights are clearly specified in advance.", [], ["benchmark-quality"]),
      q("m003-return-types", "s1p-t01", "A quoted annual rate of 8% compounds quarterly. The effective annual rate is closest to:", ["8.00%", "8.16%", "8.24%"], 2, "Four quarterly periods at 2% produce (1.02)^4 - 1 = 8.24%.", ["EAR = (1 + rs/m)^m - 1"], ["effective-annual-rate"]),
      q("m003-return-types", "s1p-t02", "A taxable bond yields 6.5% and the investor's marginal tax rate is 30%. Its after-tax yield is:", ["1.95%", "4.55%", "6.20%"], 1, "For fully taxable interest, after-tax yield is 6.5% × (1 - 0.30) = 4.55%.", ["After-tax return = pretax return × (1 - tax rate)"], ["after-tax-return"]),
      q("m003-return-types", "s1p-t03", "An investor requires 4% compensation for time value, 2% expected inflation, and 3% risk compensation. The additive required return estimate is:", ["5%", "7%", "9%"], 2, "The additive approximation sums the required components to 9%.", ["Required return ≈ real risk-free rate + inflation premium + risk premiums"], ["required-return"]),
      q("m004-tvm-valuation", "s1p-v01", "A single 10,000 payment is due in three years. At a 6% annual discount rate, its present value is closest to:", ["7,920", "8,396", "9,434"], 1, "Discounting 10,000 for three periods gives 10,000 / 1.06^3 = 8,396.", ["PV = FV / (1 + r)^N"], ["present-value"]),
      q("m004-tvm-valuation", "s1p-v02", "Compared with an otherwise identical ordinary annuity, an annuity due has:", ["A lower present value", "The same present value", "A higher present value"], 2, "Each annuity-due cash flow arrives one period earlier and is discounted for one fewer period.", [], ["annuity-due"]),
      q("m004-tvm-valuation", "s1p-v03", "For a perpetuity paying 75 one year from now when the required return is 5%, value is:", ["1,425", "1,500", "1,575"], 1, "A level perpetuity is C/r, so 75/0.05 = 1,500.", ["PV perpetuity = C / r"], ["perpetuity"]),
      q("m004-no-arbitrage", "s1p-n01", "Two portfolios have identical future state-contingent cash flows but different current prices. The most defensible conclusion is:", ["Their expected returns must be equal", "A no-arbitrage violation exists", "The higher-priced portfolio has lower duration"], 1, "The law of one price requires identical payoffs to have identical current values absent market frictions.", [], ["law-of-one-price"]),
      q("m004-no-arbitrage", "s1p-n02", "A security promises 106 in one year and sells for 100. Its implied one-year discount rate is:", ["5.66%", "6.00%", "6.36%"], 1, "The implied rate solves 100(1+r)=106, giving 6.00%.", ["r = FV / PV - 1"], ["implied-rate"]),
      q("m005-statistics", "s1p-s01", "Returns are 4%, 7%, and 13%. Their population mean is:", ["7%", "8%", "9%"], 1, "The arithmetic population mean is (4 + 7 + 13)/3 = 8%.", ["Population mean = sum(xi) / N"], ["arithmetic-mean"]),
      q("m005-statistics", "s1p-s02", "For a positively skewed return distribution, the usual ordering is:", ["Mean < median < mode", "Mode < median < mean", "Median < mean < mode"], 1, "The long right tail typically pulls the mean above the median and mode.", [], ["positive-skew"]),
      q("m005-statistics", "s1p-s03", "Which dispersion measure expresses risk per unit of arithmetic mean?", ["Coefficient of variation", "Semivariance", "Interquartile range"], 0, "The coefficient of variation divides standard deviation by the arithmetic mean.", ["CV = standard deviation / mean"], ["coefficient-of-variation"]),
    ],
  },
  {
    session: 2, id: "session-02-independent-practice", title: "Session 02 | Independent statistics and portfolio practice", topic: "Quantitative Methods",
    modules: ["m005-statistics", "m006-distributions", "m007-inference", "m008-portfolio", "m009-simulation"],
    questions: [
      q("m005-statistics", "s2p-s01", "A sample has observations 2, 5, and 8. Its sample variance is:", ["6", "9", "18"], 1, "Squared deviations total 18 and the sample denominator is n - 1 = 2, giving 9.", ["s² = sum((xi - xbar)²) / (n - 1)"], ["sample-variance"]),
      q("m005-statistics", "s2p-s02", "Which measure is least affected by one extremely large positive observation?", ["Arithmetic mean", "Median", "Standard deviation"], 1, "The median depends on rank rather than magnitude and is resistant to an extreme value.", [], ["robust-statistic"]),
      q("m005-statistics", "s2p-s03", "If covariance between two assets is negative, combining them most directly offers:", ["A guaranteed positive return", "A diversification benefit", "A higher expected covariance"], 1, "Negative co-movement can reduce portfolio variance; it does not guarantee returns.", [], ["covariance"]),
      q("m006-distributions", "s2p-d01", "For a continuous random variable, the probability of observing exactly one specified value is:", ["Zero", "The density at that value", "One minus the cumulative probability"], 0, "A single point has zero area under a continuous density function.", [], ["continuous-distribution"]),
      q("m006-distributions", "s2p-d02", "A normal variable has mean 50 and standard deviation 4. A value of 58 has a z-score of:", ["1", "2", "4"], 1, "Standardization gives (58 - 50)/4 = 2.", ["z = (x - mean) / standard deviation"], ["z-score"]),
      q("m006-distributions", "s2p-d03", "A lognormally distributed asset price is most accurately described as:", ["Bounded below by zero", "Symmetric around its mean", "Able to take any negative value"], 0, "A lognormal variable is positive and right-skewed.", [], ["lognormal"]),
      q("m007-inference", "s2p-i01", "Increasing sample size while population variance is unchanged most directly causes the standard error of the mean to:", ["Increase", "Remain unchanged", "Decrease"], 2, "Standard error equals sigma divided by the square root of n.", ["SE(xbar) = sigma / sqrt(n)"], ["standard-error"]),
      q("m007-inference", "s2p-i02", "A 95% confidence interval is 4.2% to 7.8%. Which interpretation is most appropriate?", ["There is a 95% probability this fixed interval contains the parameter", "The procedure captures the parameter in 95% of repeated samples", "95% of observations lie inside the interval"], 1, "Frequentist confidence describes the long-run coverage of the procedure, not a probability assigned to a fixed parameter.", [], ["confidence-interval"]),
      q("m007-inference", "s2p-i03", "Rejecting a true null hypothesis is classified as:", ["A Type I error", "A Type II error", "Statistical power"], 0, "A Type I error is a false rejection of the null hypothesis.", [], ["type-i-error"]),
      q("m008-portfolio", "s2p-p01", "A portfolio invests 40% in an asset returning 5% and 60% in an asset returning 10%. Portfolio return is:", ["7.0%", "8.0%", "9.0%"], 1, "The weighted return is 0.40(5%) + 0.60(10%) = 8%.", ["Rp = sum(wi Ri)"], ["portfolio-return"]),
      q("m008-portfolio", "s2p-p02", "Holding individual asset volatilities constant, portfolio variance is lowest when correlation is closest to:", ["-1", "0", "+1"], 0, "Lower correlation provides stronger diversification; -1 permits the greatest variance reduction.", [], ["correlation"]),
      q("m008-portfolio", "s2p-p03", "A two-asset portfolio has weights 0.7 and 0.3. For it to be fully invested without leverage, which condition must hold?", ["Weights multiply to one", "Weights sum to one", "Returns sum to one"], 1, "A fully invested portfolio allocates 100% of capital, so weights sum to one.", [], ["portfolio-weights"]),
      q("m009-simulation", "s2p-m01", "The principal purpose of setting a random seed in a Monte Carlo analysis is to improve:", ["Reproducibility", "Economic realism", "Sample independence"], 0, "A fixed seed allows the same pseudo-random sequence and results to be reproduced.", [], ["simulation-seed"]),
      q("m009-simulation", "s2p-m02", "A simulation model omits volatility clustering observed in actual returns. This is primarily:", ["Sampling error", "Model risk", "Look-ahead bias"], 1, "The output inherits limitations from the assumed data-generating process; that is model risk.", [], ["model-risk"]),
      q("m009-simulation", "s2p-m03", "Bootstrapping a return series differs from a parametric simulation because bootstrapping generally:", ["Resamples observed data", "Requires normality", "Eliminates dependence automatically"], 0, "Bootstrap methods draw repeatedly from observed data rather than only from a specified parametric distribution.", [], ["bootstrap"]),
    ],
  },
  {
    session: 3, id: "session-03-independent-practice", title: "Session 03 | Independent regression and economics practice", topic: "Quantitative Methods and Economics",
    modules: ["m010-regression", "m011-data-science", "m012-market-structures", "m013-business-cycles", "m014-fiscal-policy", "m015-monetary-policy", "m016-geopolitics"],
    questions: [
      q("m010-regression", "s3p-r01", "In y = 1.5 + 0.8x, the predicted change in y for a two-unit increase in x is:", ["0.8", "1.5", "1.6"], 2, "The slope is the predicted change per unit of x, so 0.8 × 2 = 1.6.", ["Predicted change in y = b1 × change in x"], ["regression-slope"]),
      q("m010-regression", "s3p-r02", "A regression has R-squared of 0.64. The most accurate interpretation is that:", ["64% of variation in the dependent variable is explained in sample", "Correlation must be -0.80", "64% of forecasts will be correct"], 0, "R-squared is the fraction of sample variation in y explained by the regression.", [], ["r-squared"]),
      q("m010-regression", "s3p-r03", "A slope t-statistic is 2.7 and the two-sided 5% critical value is 1.96. The analyst should:", ["Fail to reject a zero slope", "Reject a zero slope", "Conclude causation"], 1, "The absolute t-statistic exceeds the critical value; significance alone does not establish causation.", [], ["slope-test"]),
      q("m011-data-science", "s3p-d01", "A model performs extremely well in training but poorly on unseen observations. The most likely issue is:", ["Underfitting", "Overfitting", "Stationarity"], 1, "Overfitting captures sample-specific noise that does not generalize.", [], ["overfitting"]),
      q("m011-data-science", "s3p-d02", "Using information that became available after a forecast date in model training creates:", ["Look-ahead bias", "Class imbalance", "Regularization"], 0, "Look-ahead bias contaminates the information set with future data.", [], ["look-ahead-bias"]),
      q("m012-market-structures", "s3p-f01", "A firm faces a horizontal demand curve at the market price. It most likely operates under:", ["Perfect competition", "Monopolistic competition", "Monopoly"], 0, "A perfectly competitive firm is a price taker and can sell at the prevailing market price.", [], ["perfect-competition"]),
      q("m012-market-structures", "s3p-f02", "A profit-maximizing firm should expand output while:", ["Marginal revenue exceeds marginal cost", "Average cost exceeds price", "Total revenue is falling"], 0, "Additional output adds profit while marginal revenue exceeds marginal cost; optimum occurs where they are equal subject to constraints.", [], ["profit-maximization"]),
      q("m013-business-cycles", "s3p-c01", "Inventory accumulation and slowing new orders are most consistent with which business-cycle direction?", ["Accelerating expansion", "Approaching contraction", "Early recovery"], 1, "Unplanned inventory building and weaker orders commonly signal slowing demand before contraction.", [], ["business-cycle"]),
      q("m013-business-cycles", "s3p-c02", "Which indicator is most likely lagging rather than leading the business cycle?", ["Average duration of unemployment", "New manufacturing orders", "Equity-market index"], 0, "Unemployment duration usually responds after economic conditions have changed.", [], ["economic-indicators"]),
      q("m014-fiscal-policy", "s3p-fp01", "A government raises spending without changing taxes during a recession. In the short run this is best described as:", ["Expansionary fiscal policy", "Contractionary monetary policy", "An automatic stabilizer only"], 0, "Higher discretionary government spending directly increases aggregate demand, all else equal.", [], ["fiscal-policy"]),
      q("m014-fiscal-policy", "s3p-fp02", "Crowding out most directly refers to fiscal expansion causing:", ["Higher interest rates that restrain private investment", "Lower taxes through automatic stabilization", "A lower money multiplier"], 0, "Government borrowing can raise rates and displace interest-sensitive private spending.", [], ["crowding-out"]),
      q("m015-monetary-policy", "s3p-mp01", "A central bank sells government securities in the open market. The immediate intended direction is toward:", ["Higher bank reserves", "Lower short-term rates", "Tighter liquidity"], 2, "An open-market sale withdraws reserves and tightens monetary conditions.", [], ["open-market-operations"]),
      q("m015-monetary-policy", "s3p-mp02", "If expected inflation rises one-for-one while the real policy stance is unchanged, the nominal policy rate should most directly:", ["Rise", "Fall", "Remain unchanged"], 0, "A Fisher-consistent nominal rate incorporates expected inflation.", [], ["policy-rate"]),
      q("m016-geopolitics", "s3p-g01", "A trade embargo affects a manufacturer primarily through unavailable imported inputs. The first-order analytical channel is:", ["Supply-chain exposure", "Domestic fiscal multiplier", "Sampling variation"], 0, "The event impairs access to production inputs, so the direct channel is the supply chain.", [], ["geopolitical-risk"]),
      q("m016-geopolitics", "s3p-g02", "For a diversified global investor, geopolitical analysis is strongest when it links an event first to:", ["A precise forecast date", "Exposure and a valuation transmission channel", "A narrative severity label alone"], 1, "Decision-useful analysis identifies who is exposed and how cash flows, discount rates, liquidity, or risk premia may change.", [], ["transmission-channel"]),
    ],
  },
];

function privatePrompts(session) {
  const file = path.join(output, `Hamad_CFA_Level_I_Session_0${session}_Private_Playbook.json`);
  const playbook = JSON.parse(fs.readFileSync(file, "utf8"));
  return playbook.chunks.flatMap(chunk => chunk.stages ?? []).flatMap(stage => stage.cards ?? [])
    .flatMap(card => [card.prompt, ...(card.ask ?? [])]).filter(Boolean);
}

fs.mkdirSync(output, { recursive: true });
const report = [];
for (const specification of specifications) {
  const bank = parsePracticeBankDraft({
    schemaVersion: 1, id: specification.id, version: `s0${specification.session}-${stamp}`,
    title: specification.title, topic: specification.topic, moduleIds: specification.modules,
    sourceSessionIds: [`session-0${specification.session}`], questions: specification.questions,
  });
  const prompts = privatePrompts(specification.session);
  assertIndependentPracticeQuestions(bank, prompts);
  const maximumSimilarity = Math.max(...bank.questions.flatMap(question => prompts.map(prompt => questionSimilarity(question.prompt, prompt))));
  const file = path.join(output, `Hamad_CFA_Level_I_Session_0${specification.session}_Independent_Practice.json`);
  fs.writeFileSync(file, `${JSON.stringify(bank, null, 2)}\n`);
  report.push({ session: specification.session, file: path.basename(file), questions: bank.questions.length, modules: bank.moduleIds.length, maximumSessionPromptSimilarity: Number(maximumSimilarity.toFixed(3)), tutorOnlyFields: 0 });
}
fs.writeFileSync(path.join(output, "Hamad_CFA_Independent_Practice_QA_Report.json"), `${JSON.stringify({ generatedAt: new Date().toISOString(), independenceThreshold: 0.68, banks: report }, null, 2)}\n`);
console.log(report.map(item => `Session ${item.session}: ${item.questions} questions across ${item.modules} modules; max similarity ${item.maximumSessionPromptSimilarity}`).join("\n"));
