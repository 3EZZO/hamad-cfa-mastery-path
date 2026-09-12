import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  assertIndependentPracticeQuestions,
  parsePracticeBankDraft,
  questionSimilarity,
} from "../src/lib/practiceContent.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.resolve(root, "..", "output", "json", "practice-session-01-expanded");
const privateFile = path.resolve(root, "..", "output", "json", "Hamad_CFA_Level_I_Session_01_Private_Playbook.json");
const contexts = [
  "While reviewing a pension portfolio's quarterly report",
  "During an investment committee challenge on a proposed allocation",
  "When reconciling a candidate's calculator output with the economic facts",
  "In a time-constrained examination vignette involving a private client",
  "While checking an analyst's recommendation before it reaches a portfolio manager",
];

function rotate(options, correct, amount) {
  const shift = amount % options.length;
  const rotated = [...options.slice(shift), ...options.slice(0, shift)];
  return { options: rotated, correctOption: (correct - shift + options.length) % options.length };
}

function makeQuestion(moduleId, definition, variant) {
  const [slug, type, core, correct, wrongOne, wrongTwo, explanation, formula, trap, tag] = definition;
  const ordered = rotate([correct, wrongOne, wrongTwo], 0, variant);
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
          "Name the requested measure and keep rates and periods consistent.",
          formula ? `Apply ${formula}.` : "Apply the governing relation to the stated inputs.",
          "Check direction and state the financial interpretation.",
        ]
      : [],
    formulae: formula ? [formula] : [],
    distractorExplanations: ordered.options.map(option =>
      option === correct
        ? "This is the correct conclusion under the stated definition and assumptions."
        : "This choice substitutes an incompatible measure, timing convention, or economic inference."
    ),
    examTrap: trap,
    tags: [tag],
  };
}

const modules = [
  {
    id: "m001-returns", code: "M001", title: "Returns of Financial Assets and Instruments",
    definitions: [
      ["holding-period", "calculation", "a security bought for 80 ends at 86 after distributing 2. Which holding-period return is correct?", "10.00%", "7.50%", "12.50%", "Price appreciation is 6 and income is 2; total gain of 8 divided by 80 equals 10.00%.", "HPR = (P1 - P0 + D1) / P0", "Include every cash distribution received during the holding interval.", "holding-period-return"],
      ["price-income", "concept", "which decomposition correctly describes a total holding-period return?", "Price return plus income return", "Real return plus inflation only", "Arithmetic mean plus geometric mean", "Total return combines the price change relative to beginning value with income relative to beginning value.", "HPR = price return + income return", "Do not divide the cash income by ending price.", "return-decomposition"],
      ["linked-return", "calculation", "an investment earns +12% followed by -5%, without external cash flows. What cumulative return should be reported?", "6.40%", "7.00%", "17.00%", "Wealth grows by 1.12 × 0.95 = 1.064, giving a cumulative return of 6.40%.", "Cumulative return = product(1 + Rt) - 1", "Sequential returns compound; they are not added.", "linked-return"],
      ["arithmetic-mean", "calculation", "annual returns are 3%, 9%, and 12%. What is the arithmetic mean return?", "8.00%", "7.55%", "24.00%", "The arithmetic mean is (3 + 9 + 12)/3 = 8.00%.", "Arithmetic mean = sum(Rt) / n", "The arithmetic mean describes an average single period, not compounded wealth.", "arithmetic-return"],
      ["geometric-mean", "calculation", "wealth rises 20% and then falls 10%. What is the annual geometric mean over the two periods?", "3.92%", "5.00%", "8.00%", "The two-period wealth relative is 1.20 × 0.90 = 1.08; its square root minus one is approximately 3.92%.", "Geometric mean = product(1 + Rt)^(1/n) - 1", "Use the root of the wealth relative rather than the arithmetic average.", "geometric-return"],
      ["twr", "concept", "a client controls the timing of large contributions. Which return best evaluates the manager?", "Time-weighted return", "Money-weighted return", "Income yield", "Time-weighted return removes the impact of external cash-flow timing that the manager does not control.", "TWR = linked subperiod returns", "Break the record at external cash-flow dates before linking.", "time-weighted-return"],
      ["mwr", "concept", "which measure reflects the investor's experienced return when contribution timing is economically relevant?", "Money-weighted return", "Time-weighted return", "Price return", "Money-weighted return is the internal rate that equates contributions and withdrawals with ending value.", "NPV at MWR = 0", "Cash-flow signs and dates determine the money-weighted result.", "money-weighted-return"],
      ["log-return", "concept", "which return has the useful property of being additive across adjacent time periods?", "Continuously compounded return", "Simple holding-period return", "Income yield", "Log returns add through time because logarithms convert compounded wealth relatives into sums.", "rt = ln(1 + Rt)", "Time additivity does not make log returns directly additive across assets.", "log-return"],
      ["gross-net", "concept", "a mandate reports performance before management fees but after trading expenses. Which label is most appropriate?", "Gross-of-fee return", "Net-of-fee return", "Real after-tax return", "Gross-of-fee performance excludes management fees while investment-related trading effects remain in portfolio results.", "", "Read the fee convention instead of inferring it from the return magnitude.", "fee-return"],
      ["annualization", "calculation", "a four-month holding-period return is 4%. Assuming compounding, what annualized return is closest?", "12.49%", "12.00%", "4.00%", "Annualization compounds three four-month periods: 1.04^3 - 1 = 12.49%.", "Annualized return = (1 + HPR)^(12/months) - 1", "A linear multiplication is only an approximation.", "annualized-return"],
    ],
  },
  {
    id: "m002-benchmarking", code: "M002", title: "Benchmarking Returns",
    definitions: [
      ["active-return", "calculation", "a portfolio earns 11.2% while its benchmark earns 8.6%. What is active return?", "2.60%", "19.80%", "8.60%", "Active return is portfolio return minus benchmark return: 2.60%.", "Active return = Rp - Rb", "Use subtraction, not a sum or ratio, for the stated active return.", "active-return"],
      ["measurable", "concept", "which benchmark quality requires returns to be calculable on a reasonably frequent basis?", "Measurability", "Appropriateness", "Unambiguity", "A measurable benchmark has observable data sufficient for timely return calculation.", "", "Measurability concerns availability of return data, not fit with the mandate.", "benchmark-measurability"],
      ["unambiguous", "concept", "constituents and weights are unknown until after evaluation. Which benchmark quality is missing?", "Unambiguity", "Investability", "Reflective of current opinions", "An unambiguous benchmark specifies constituents and weights in advance.", "", "A benchmark can be investable yet still be ambiguous if its construction is undisclosed.", "benchmark-unambiguous"],
      ["appropriate", "concept", "a small-cap manager is assessed against a large-cap index. Which benchmark quality is most directly violated?", "Appropriateness", "Measurability", "Specified in advance", "An appropriate benchmark is consistent with the manager's investment universe and style.", "", "A published index is not automatically suitable for every mandate.", "benchmark-appropriate"],
      ["investable", "concept", "which property means the benchmark could be replicated as a passive alternative?", "Investability", "Ownership", "Positive skewness", "Investability requires that the securities and weights form a feasible passive portfolio.", "", "A descriptive economic series may be measurable without being investable.", "benchmark-investable"],
      ["price-total-index", "concept", "an equity index ignores dividends. It is best described as which kind of index?", "Price return index", "Total return index", "Fundamental return index", "A price return index captures constituent price changes but excludes reinvested distributions.", "", "Check whether distributions are reinvested before comparing index returns.", "price-return-index"],
      ["equal-weight", "concept", "which index construction gives a 1% constituent the same initial influence as a 20% constituent?", "Equal weighting", "Market-capitalization weighting", "Price weighting", "An equal-weighted index assigns identical portfolio weights to each constituent at rebalancing.", "", "Equal weighting requires periodic rebalancing as prices diverge.", "equal-weight-index"],
      ["cap-weight", "concept", "a constituent's weight is proportional to its aggregate market value. Which method is used?", "Market-capitalization weighting", "Equal weighting", "Price weighting", "Market-capitalization weighting scales each constituent by market price times shares outstanding.", "wi = market capitalization i / total market capitalization", "Free-float adjustment may change the eligible share count.", "cap-weight-index"],
      ["price-weight", "concept", "a stock split changes a constituent's price without changing investor wealth. Which index requires a divisor adjustment to preserve continuity?", "Price-weighted index", "Equal-weighted index", "Fundamental-weighted index", "A price-weighted index uses the sum of prices divided by an adjusted divisor.", "Index level = sum(prices) / divisor", "Corporate actions must not create artificial index returns.", "price-weight-index"],
      ["rebalancing", "concept", "restoring target constituent weights at a scheduled date is called what?", "Rebalancing", "Reconstitution", "Chain linking", "Rebalancing resets existing constituent weights; reconstitution changes the constituent membership.", "", "Distinguish changing weights from changing which securities belong to the index.", "index-rebalancing"],
    ],
  },
  {
    id: "m003-return-types", code: "M003", title: "Types of Financial Returns",
    definitions: [
      ["ear", "calculation", "a stated annual rate is 9.6% with monthly compounding. What effective annual rate is closest?", "10.03%", "9.60%", "10.56%", "Monthly compounding gives (1 + 0.096/12)^12 - 1, approximately 10.03%.", "EAR = (1 + rs/m)^m - 1", "The stated annual rate is not the effective annual growth rate.", "effective-annual-rate"],
      ["continuous", "calculation", "a continuously compounded annual rate is 7%. What effective annual rate is closest?", "7.25%", "7.00%", "7.49%", "The effective rate is e^0.07 - 1, approximately 7.25%.", "EAR = e^rcc - 1", "Exponentiate the continuous rate before subtracting one.", "continuous-compounding"],
      ["real-return", "calculation", "a nominal return is 8% and inflation is 3%. What exact real return is closest?", "4.85%", "5.00%", "11.00%", "The exact real return is 1.08/1.03 - 1 = 4.85%.", "1 + real = (1 + nominal) / (1 + inflation)", "Nominal minus inflation is an approximation.", "real-return"],
      ["after-tax", "calculation", "fully taxable interest yields 7.2% and the marginal tax rate is 25%. What after-tax yield results?", "5.40%", "1.80%", "6.95%", "After-tax yield is 7.2% × (1 - 0.25) = 5.40%.", "After-tax yield = pretax yield × (1 - tax rate)", "Apply the tax rate to taxable return, not the principal.", "after-tax-return"],
      ["required-components", "calculation", "the real risk-free rate is 2%, expected inflation is 3%, and combined risk premiums are 4%. What additive required return estimate results?", "9.00%", "7.00%", "5.00%", "The additive approximation totals 2% + 3% + 4% = 9%.", "Required return ≈ real risk-free + expected inflation + risk premiums", "Do not omit the compensation for bearing risk.", "required-return"],
      ["discount-rate", "concept", "why can the required return also be described as a discount rate?", "It converts expected future cash flows into present value", "It guarantees the realized holding-period return", "It equals accounting profit growth", "The required return is the opportunity cost used to discount future cash flows to present value.", "PV = future cash flows discounted at required return", "A required return is an ex ante threshold, not a promised realized outcome.", "discount-rate"],
      ["opportunity-cost", "concept", "an investor rejects a project because a comparable-risk security offers a higher return. Which interpretation is being applied?", "Required return as opportunity cost", "Return as historical dispersion", "Income yield as inflation", "Capital should earn at least the return available from a comparable-risk alternative.", "", "Comparison must be made at comparable risk and horizon.", "opportunity-cost"],
      ["levered-return", "concept", "borrowing magnifies both gains and losses on equity capital. Which return characteristic is illustrated?", "Leverage changes the investor's return distribution", "Leverage eliminates price risk", "Leverage guarantees a positive spread", "Debt concentrates residual asset outcomes on a smaller equity base and therefore magnifies variability.", "Equity return reflects asset return and financing cost", "A positive expected spread is not a guaranteed realized spread.", "leveraged-return"],
      ["pre-post-cost", "concept", "two otherwise identical performance records differ only because one deducts management fees. Which return should be lower?", "Net-of-fee return", "Gross-of-fee return", "Benchmark price return necessarily", "Deducting management fees reduces the investor's reported net return relative to gross return.", "Net return ≈ gross return - fees", "Confirm which costs are included in each convention.", "net-return"],
      ["nominal-real-use", "concept", "a future liability grows with consumer prices. Which return objective is most economically relevant?", "A real return objective", "A nominal return without inflation context", "A price-only return", "A real objective measures growth in purchasing power and aligns with an inflation-sensitive liability.", "", "Match the return definition to the liability's economic unit.", "real-objective"],
    ],
  },
  {
    id: "m004-tvm-valuation", code: "M004A", title: "Time Value of Money — Valuation",
    definitions: [
      ["single-pv", "calculation", "12,000 is due in four years and the annual discount rate is 5%. What present value is closest?", "9,873", "10,286", "14,586", "Present value is 12,000/1.05^4, approximately 9,873.", "PV = FV / (1 + r)^N", "Discount future money; do not compound it forward again.", "single-sum-pv"],
      ["single-fv", "calculation", "7,500 compounds for five years at 6%. What future value is closest?", "10,037", "9,750", "5,604", "Future value is 7,500 × 1.06^5, approximately 10,037.", "FV = PV(1 + r)^N", "The exponent equals the number of compounding periods.", "single-sum-fv"],
      ["ordinary-annuity", "calculation", "an ordinary annuity pays 1,000 annually for four years at 5%. What present value is closest?", "3,546", "3,723", "4,310", "Discounting four end-of-year payments gives approximately 3,546.", "PV ordinary annuity = PMT[1 - (1 + r)^(-N)] / r", "An ordinary annuity's first payment occurs one period from today.", "ordinary-annuity"],
      ["annuity-due", "concept", "relative to an identical ordinary annuity, why is an annuity due more valuable?", "Every payment arrives one period earlier", "It contains one additional payment", "Its discount rate is automatically lower", "Moving every payment one period earlier multiplies the ordinary-annuity value by 1 + r.", "PV due = PV ordinary × (1 + r)", "The number and amount of payments stay unchanged.", "annuity-due"],
      ["perpetuity", "calculation", "a perpetuity pays 90 one year from now and the required return is 6%. What is its value?", "1,500", "1,410", "1,590", "A level perpetuity is 90/0.06 = 1,500.", "PV perpetuity = C / r", "The first payment must occur one period from valuation.", "perpetuity"],
      ["growing-perpetuity", "calculation", "next year's cash flow is 52, growth is 2%, and required return is 7%. What value is closest?", "1,040", "743", "1,061", "The growing perpetuity value is 52/(0.07 - 0.02) = 1,040.", "PV growing perpetuity = C1 / (r - g)", "Use next-period cash flow and require r greater than g.", "growing-perpetuity"],
      ["uneven-cashflows", "concept", "cash flows differ each year and have no repeating pattern. Which valuation method is appropriate?", "Discount each cash flow separately and sum", "Use the perpetuity formula", "Average the cash flows before discounting", "Uneven cash flows are valued by discounting each amount at its own time index and summing present values.", "PV = sum(CFt / (1 + r)^t)", "Averaging destroys timing information.", "uneven-cashflows"],
      ["npv", "calculation", "a project costs 1,000 today and has present value of future inflows equal to 1,140. What is NPV?", "140", "1,140", "2,140", "NPV equals 1,140 minus the 1,000 initial outlay, or 140.", "NPV = PV inflows - PV outflows", "Treat the initial investment as a cash outflow at time zero.", "net-present-value"],
      ["rate-price", "concept", "holding promised cash flows constant, what happens to present value when the discount rate rises?", "Present value falls", "Present value rises", "Present value is unchanged", "A higher discount rate increases every discount denominator and reduces present value.", "PV = sum(CFt / (1 + r)^t)", "The inverse price-rate relation assumes cash flows are held constant.", "discount-rate-direction"],
      ["timeline", "concept", "what should be established before entering TVM keys on a financial calculator?", "A dated cash-flow timeline and consistent period rate", "The final answer rounded to two decimals", "A geometric mean of all cash flows", "A timeline fixes signs, payment dates, number of periods, and the rate per period before calculation.", "", "Calculator correctness cannot repair a misdated cash flow.", "tvm-timeline"],
    ],
  },
  {
    id: "m004-no-arbitrage", code: "M004B", title: "Time Value of Money — Implied Values and No Arbitrage",
    definitions: [
      ["law-one-price", "concept", "two tradable portfolios deliver identical cash flows in every future state but sell for different amounts today. What follows?", "An arbitrage opportunity exists absent frictions", "Both prices are valid because expected returns differ", "The lower price must have higher duration", "Identical state-contingent payoffs must have the same present price under the law of one price.", "Price A = Price B for identical future payoffs", "Compare complete payoff vectors, not only expected payoffs.", "law-of-one-price"],
      ["replication", "concept", "a target security's payoff can be exactly generated by a portfolio of traded instruments. How is its no-arbitrage value determined?", "By the cost of the replicating portfolio", "By its historical average price", "By the issuer's accounting book value", "No arbitrage equates the target price to the cost of an exact payoff replication.", "Target value = replication cost", "Replication requires equality across every relevant state and date.", "replication"],
      ["implied-rate", "calculation", "a zero-coupon claim pays 112 in two years and costs 100 today. What annual implied return is closest?", "5.83%", "6.00%", "12.00%", "The annual rate solves (112/100)^(1/2) - 1, approximately 5.83%.", "r = (FV / PV)^(1/N) - 1", "Annualize with a root rather than dividing total return by years.", "implied-rate"],
      ["forward-value", "calculation", "the one-year spot rate is 4% and the two-year spot rate is 5%. What one-year forward rate one year from now is closest?", "6.01%", "5.00%", "1.00%", "No arbitrage gives (1.05)^2/(1.04) - 1, approximately 6.01%.", "1 + f1,1 = (1 + S2)^2 / (1 + S1)", "Match the horizon and compounding convention of every rate.", "forward-rate"],
      ["spot-definition", "concept", "which rate discounts a single cash flow from a specified future date directly to today?", "Spot rate for that maturity", "Coupon rate", "Holding-period income yield", "A maturity-specific spot rate prices a zero-coupon cash flow from that date to the present.", "PVt = CFt / (1 + St)^t", "A coupon rate describes promised payments, not the market discount curve.", "spot-rate"],
      ["forward-definition", "concept", "which rate is agreed today for borrowing or lending over a future interval?", "Forward rate", "Current spot rate only", "Arithmetic mean return", "A forward rate applies to a future period and is implied by or compared with the current term structure.", "", "Identify both the start date and length of the forward interval.", "forward-rate-definition"],
      ["cash-carry", "concept", "a forward is overpriced relative to spot plus financing and carrying costs. Which trade direction is consistent with cash-and-carry arbitrage?", "Buy the asset and sell the forward", "Short the asset and buy the forward", "Buy both the asset and forward", "Buying spot with financing and selling the overpriced forward locks the pricing discrepancy, subject to costs and short-sale assumptions.", "Forward fair value reflects spot carried to maturity", "Include income and carrying benefits before declaring arbitrage.", "cash-and-carry"],
      ["state-pricing", "concept", "why is matching only the expected payoff insufficient for a replication argument?", "Payoffs must match in each relevant state", "Expected values are never useful", "Replicating portfolios cannot contain bonds", "Different state distributions can have equal expectations but different risk and prices.", "", "No-arbitrage replication is state-by-state, not mean-by-mean.", "state-contingent-payoff"],
      ["curve-consistency", "concept", "discounting every maturity with one average rate when the spot curve is not flat creates what primary problem?", "A maturity mismatch in valuation", "A guaranteed arbitrage profit", "An arithmetic mean bias only", "Each dated cash flow should be discounted using the rate appropriate to its maturity.", "PV = sum(CFt / (1 + St)^t)", "A yield summary need not reproduce every spot-discounted price exactly.", "term-structure"],
      ["arbitrage-conditions", "concept", "which combination most weakens a textbook arbitrage conclusion in practice?", "Transaction costs, funding constraints, and short-sale limits", "A clearly defined payoff timeline", "Observable market prices", "Implementation frictions can absorb or prevent exploitation of a theoretical price discrepancy.", "", "Distinguish a model inconsistency from an executable riskless profit.", "arbitrage-frictions"],
    ],
  },
  {
    id: "m005-statistics", code: "M005", title: "Statistical Characteristics of Asset Returns",
    definitions: [
      ["population-mean", "calculation", "population returns are 2%, 6%, 7%, and 9%. What is the population mean?", "6.00%", "5.50%", "24.00%", "The four returns sum to 24%; dividing by N = 4 gives 6.00%.", "mu = sum(xi) / N", "Use N for a complete population.", "population-mean"],
      ["weighted-mean", "calculation", "weights of 30% and 70% apply to returns of 4% and 10%. What is the weighted mean?", "8.20%", "7.00%", "14.00%", "The weighted mean is 0.30(4%) + 0.70(10%) = 8.20%.", "Weighted mean = sum(wi xi)", "Confirm weights sum to one and align each weight with its observation.", "weighted-mean"],
      ["median", "concept", "one return observation is an extreme positive outlier. Which location measure is least affected?", "Median", "Arithmetic mean", "Range", "The median depends on rank and is robust to the magnitude of an extreme observation.", "", "Robustness does not mean the median uses every magnitude.", "median"],
      ["harmonic", "calculation", "equal cash amounts are invested at prices 20 and 30. What harmonic mean price is paid per unit?", "24.00", "25.00", "25.50", "For equal cash, the average price is 2/(1/20 + 1/30) = 24.", "H = n / sum(1/xi)", "Use the harmonic mean only when the economic weighting is appropriate.", "harmonic-mean"],
      ["sample-variance", "calculation", "a sample contains 3, 5, and 7. What is its sample variance?", "4.00", "2.67", "8.00", "Squared deviations from 5 total 8; dividing by n - 1 = 2 gives 4.", "s² = sum((xi - xbar)²) / (n - 1)", "Use n - 1 for a sample variance estimate.", "sample-variance"],
      ["standard-deviation", "concept", "what does standard deviation contribute relative to variance?", "Dispersion expressed in the original return units", "A measure of central tendency", "A guarantee about tail probability", "Taking the square root of variance returns dispersion to the units of the observations.", "s = sqrt(s²)", "Standard deviation alone does not specify distribution shape.", "standard-deviation"],
      ["covariance", "concept", "what does a negative covariance between two asset returns indicate?", "They tend to move in opposite directions relative to their means", "Both assets have negative expected returns", "Their volatilities are zero", "Covariance records the average product of paired deviations; a negative sign indicates opposite co-movement.", "Cov(X,Y) = E[(X - EX)(Y - EY)]", "Covariance sign describes co-movement, not standalone expected return.", "covariance"],
      ["correlation", "calculation", "covariance is 0.012, while standard deviations are 0.15 and 0.10. What correlation results?", "0.80", "0.012", "1.25", "Correlation is 0.012/(0.15 × 0.10) = 0.80.", "rho = Cov(X,Y) / (sigmaX sigmaY)", "Correlation must remain between -1 and +1.", "correlation"],
      ["skewness", "concept", "a return distribution has a long right tail. Which ordering is most typical?", "Mode < median < mean", "Mean < median < mode", "Mean = median = mode necessarily", "A long positive tail pulls the arithmetic mean furthest to the right.", "", "Skewness concerns asymmetry, not simply high variance.", "positive-skew"],
      ["coefficient-variation", "calculation", "an investment has expected return of 8% and standard deviation of 12%. What is its coefficient of variation?", "1.50", "0.67", "20.00", "Coefficient of variation is 12%/8% = 1.50 units of risk per unit of mean return.", "CV = standard deviation / mean", "The ratio is difficult to interpret when the mean is zero or negative.", "coefficient-of-variation"],
    ],
  },
];

const privatePlaybook = JSON.parse(fs.readFileSync(privateFile, "utf8"));
const privatePrompts = privatePlaybook.chunks
  .flatMap(chunk => chunk.stages ?? [])
  .flatMap(stage => stage.cards ?? [])
  .flatMap(card => [card.prompt, ...(card.ask ?? [])])
  .filter(Boolean);

fs.mkdirSync(output, { recursive: true });
const report = [];
for (const module of modules) {
  const questions = module.definitions.flatMap(definition =>
    contexts.map((_, variant) => makeQuestion(module.id, definition, variant))
  );
  const bank = parsePracticeBankDraft({
    schemaVersion: 1,
    id: `session-01-${module.id}-expanded`,
    version: "s01-2026-09-12-v2",
    title: `Session 01 | ${module.code} ${module.title}`,
    topic: module.title,
    moduleIds: [module.id],
    sourceSessionIds: ["session-01"],
    questions,
  });
  assertIndependentPracticeQuestions(bank, privatePrompts);
  const maximumSessionSimilarity = Math.max(...questions.flatMap(question =>
    privatePrompts.map(prompt => questionSimilarity(question.prompt, prompt))
  ));
  const filename = `Hamad_CFA_Level_I_Session_01_${module.code}_Expanded_Practice.json`;
  fs.writeFileSync(path.join(output, filename), `${JSON.stringify(bank, null, 2)}\n`);
  report.push({ moduleId: module.id, file: filename, questions: questions.length, learningObjectives: module.definitions.length, maximumSessionSimilarity: Number(maximumSessionSimilarity.toFixed(3)) });
}
fs.writeFileSync(path.join(output, "Session_01_Expanded_Practice_QA_Report.json"), `${JSON.stringify({ generatedAt: new Date().toISOString(), expectedQuestionsPerModule: 50, sessionSimilarityThreshold: 0.68, internalNearDuplicateThreshold: 0.88, banks: report }, null, 2)}\n`);
console.log(report.map(item => `${item.moduleId}: ${item.questions} questions; max Session Mode similarity ${item.maximumSessionSimilarity}`).join("\n"));
