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
const output = path.join(jsonRoot, "practice-session-03-expanded");
const privateFile = path.join(jsonRoot, "Hamad_CFA_Level_I_Session_03_Private_Playbook.json");
const existingFile = path.join(jsonRoot, "Hamad_CFA_Level_I_Session_03_Independent_Practice.json");
const contexts = [
  "While reviewing an investment research note",
  "During an investment committee challenge",
  "When auditing a junior analyst's conclusion",
  "In a time-constrained examination item",
  "Before translating the result into a portfolio decision",
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
          "Identify the requested economic or statistical quantity and align the units.",
          formula ? `Apply ${formula}.` : "Apply the governing analytical relation.",
          "Check the direction and state the investment implication without exceeding the evidence.",
        ]
      : [],
    formulae: formula ? [formula] : [],
    distractorExplanations: ordered.options.map(option => option === correct
      ? "This choice follows the governing relation and the facts stated in the question."
      : "This choice changes the definition, causal channel, assumption, or decision criterion."),
    examTrap: trap,
    tags: [tag],
  };
}

const modules = [
  {
    id: "m010-regression", code: "M010", title: "Applications of Simple Linear Regression in Finance",
    definitions: [
      ["ols-slope", "calculation", "the sample covariance of X and Y is 18 and the sample variance of X is 24. What least-squares slope is implied?", "0.75", "1.33", "42.00", "The simple-regression slope is covariance divided by the variance of the independent variable: 18/24 = 0.75.", "b1 = Cov(X,Y) / Var(X)", "The denominator is the variance of X, not the variance of Y.", "regression-slope"],
      ["fitted-residual", "calculation", "the fitted equation is Y-hat = 2 + 1.5X. If X is 4 and observed Y is 9, what residual is correct?", "1.00", "8.00", "-1.00", "The fitted value is 8; residual equals observed minus fitted, so 9 - 8 = 1.", "ei = Yi - Y-hat-i", "A residual is observed minus fitted; reversing the subtraction changes its sign.", "regression-residual"],
      ["anova-r2", "calculation", "total sum of squares is 200 and residual sum of squares is 50. What coefficient of determination is correct?", "0.75", "0.25", "4.00", "Explained sum of squares is 150, so R-squared is 150/200 = 0.75, equivalently 1 - 50/200.", "R^2 = 1 - SSE/SST", "R-squared is a proportion of sample variation explained, not a forecast success rate.", "coefficient-determination"],
      ["see", "calculation", "a simple regression with 12 observations has SSE of 90. What standard error of estimate is correct?", "3.00", "2.74", "9.00", "Simple regression estimates two coefficients, so SEE = sqrt[90/(12 - 2)] = 3.", "SEE = sqrt[SSE/(n - 2)]", "Use residual degrees of freedom n - 2 in simple linear regression.", "standard-error-estimate"],
      ["slope-test", "calculation", "the estimated slope is 0.60 with standard error 0.20. For H0: beta1 = 0, what t-statistic is correct?", "3.00", "0.12", "0.33", "The test statistic is (0.60 - 0)/0.20 = 3.00.", "t = (b1 - beta1,0) / SE(b1)", "Compare the statistic with the critical value before stating statistical significance.", "slope-hypothesis-test"],
      ["f-test", "concept", "in a simple regression with one independent variable, how is the overall regression F-statistic related to the two-sided slope t-statistic?", "F equals t squared", "F equals the absolute value of t", "F equals one minus R-squared", "With one slope restriction, the overall F-test and two-sided slope test are equivalent and F = t^2.", "F = t^2 in simple regression", "This exact equivalence does not extend unchanged to a multiple-regression joint test.", "regression-f-test"],
      ["prediction-interval", "concept", "which interval is wider at a given X value: an interval for the conditional mean of Y or an interval for one new Y observation?", "The prediction interval for one new observation", "The confidence interval for the conditional mean", "They must have identical width", "A prediction interval includes both uncertainty in the estimated conditional mean and the new observation's disturbance variance.", "", "Do not report a confidence interval for the mean as if it covered an individual outcome.", "prediction-interval"],
      ["assumptions", "concept", "residual variance rises systematically with X. Which simple-regression assumption is violated?", "Homoskedasticity", "Linearity of the conditional mean necessarily", "Normality of X", "Systematically changing disturbance variance is heteroskedasticity, violating the constant conditional-variance assumption.", "Var(epsilon|X) = sigma^2", "The regression assumptions concern the disturbance conditional on X, not a requirement that X itself be normal.", "heteroskedasticity"],
      ["functional-form", "concept", "both Y and X are expressed in natural logarithms. How is the slope interpreted?", "Approximate percentage change in Y for a 1% change in X", "Unit change in Y for a one-unit change in X", "Percentage-point change in Y for a one-unit change in X", "In a log-log specification, the slope is an elasticity.", "ln(Y) = b0 + b1 ln(X)", "Distinguish a percentage change from a percentage-point change.", "log-log-regression"],
      ["capm", "concept", "in a time-series CAPM regression of an asset's excess return on market excess return, what does the slope estimate?", "The asset's market beta", "The asset's abnormal return alpha", "The asset's total variance", "The slope measures sensitivity of the asset's excess return to market excess return; the intercept estimates alpha.", "Ri - Rf = alpha + beta(Rm - Rf) + epsilon", "A statistically significant beta does not establish manager skill.", "capm-regression"],
    ],
  },
  {
    id: "m011-data-science", code: "M011", title: "Introduction to Financial Data Science",
    definitions: [
      ["big-data", "concept", "a market-data feed becomes too rapid for the existing ingestion system even though its format is unchanged. Which big-data dimension is most directly implicated?", "Velocity", "Variety", "Veracity only", "Velocity concerns the speed at which data arrive and must be processed.", "", "Volume is amount, velocity is speed, and variety is heterogeneity of format and source.", "big-data-velocity"],
      ["data-structure", "concept", "earnings-call audio and free-form analyst commentary are incorporated into a model. How should these inputs be classified?", "Unstructured data", "Structured relational data", "Target labels", "Audio and unconstrained natural language do not arrive in a predefined tabular schema and are unstructured data.", "", "Data can be useful without being structured; preprocessing determines how it becomes model-ready.", "unstructured-data"],
      ["alternative-data", "concept", "satellite images of retailer parking lots are used to estimate sales before financial statements are released. This is best classified as what?", "Alternative data", "Traditional company filing data", "A supervised-learning target by definition", "Satellite imagery is an unconventional external source used to infer economic activity and is alternative data.", "", "Alternative data still requires legality, provenance, bias, and materiality controls.", "alternative-data"],
      ["supervised", "concept", "a model is trained on historical borrower attributes paired with observed default outcomes. Which learning paradigm is used?", "Supervised learning", "Unsupervised learning", "Reinforcement learning necessarily", "Observed outcomes provide labels, so the algorithm learns a mapping from features to a defined target.", "", "A classification target can be binary even when predicted outputs are probabilities.", "supervised-learning"],
      ["unsupervised", "concept", "an analyst groups companies by similarity without supplying sector labels. Which technique is most directly applicable?", "Unsupervised clustering", "Supervised classification", "Ordinary least squares with a known target", "Clustering discovers structure in unlabeled observations rather than predicting a supplied outcome.", "", "Clusters are model-dependent groupings, not automatically economically meaningful categories.", "unsupervised-learning"],
      ["neural-networks", "concept", "what most directly distinguishes deep learning from a shallow linear model?", "Multiple nonlinear representation layers learned from data", "Guaranteed causal interpretation", "No need for validation data", "Deep neural networks combine successive nonlinear transformations to learn hierarchical representations.", "", "Greater flexibility raises data, computation, interpretability, and overfitting concerns.", "deep-learning"],
      ["nlp", "concept", "a system converts corporate filings into sentiment scores and named entities. Which field is being applied?", "Natural language processing", "Cluster sampling", "Numerical integration", "NLP extracts structured signals from human language, including sentiment, entities, and relationships.", "", "Text-derived variables can contain domain, labeling, and look-ahead biases.", "natural-language-processing"],
      ["algorithmic-trading", "concept", "an automated strategy converts a signal into orders. Which control most directly limits implementation harm?", "Pre-trade limits, monitoring, and a tested kill switch", "Maximizing message frequency", "Eliminating all human oversight", "Execution automation requires explicit limits, monitoring, exception handling, and the ability to halt abnormal behavior.", "", "A predictive edge does not remove market-impact, operational, liquidity, or model risk.", "algorithmic-trading"],
      ["validation", "concept", "a model performs exceptionally in training but poorly on chronologically later observations. What is the most likely diagnosis?", "Overfitting or unstable relationships", "Guaranteed alpha decay from transaction costs only", "Underfitting because training performance is high", "A large training-to-holdout performance gap indicates that sample-specific noise or unstable structure was learned.", "", "Financial validation should respect time order and prevent future information from entering training features.", "overfitting-validation"],
      ["governance", "concept", "a complex model materially affects investment decisions but no owner can explain its data lineage or override process. What is missing?", "Model governance", "Higher model complexity", "More alternative data necessarily", "Governance assigns ownership, documents lineage and limitations, monitors drift, and defines approval and override controls.", "", "Human oversight complements rather than certifies model validity.", "model-governance"],
    ],
  },
  {
    id: "m012-market-structures", code: "M012", title: "The Firm and Market Structures",
    definitions: [
      ["economic-profit", "calculation", "revenue is 500, explicit costs are 380, and the owner's next-best opportunity is worth 70. What economic profit is correct?", "50", "120", "190", "Economic profit subtracts explicit and implicit opportunity costs: 500 - 380 - 70 = 50.", "Economic profit = total revenue - explicit costs - implicit costs", "Accounting profit omits implicit opportunity cost; economic profit does not.", "economic-profit"],
      ["marginal-cost", "calculation", "total cost rises from 840 to 900 when output increases from 100 to 110 units. What marginal cost per additional unit is correct?", "6", "60", "9", "Incremental cost is 60 for 10 additional units, so marginal cost is 6 per unit.", "MC = change in total cost / change in quantity", "Do not divide total cost by output when the question asks for marginal cost.", "marginal-cost"],
      ["profit-max", "concept", "a firm can sell one more unit for marginal revenue of 14 while marginal cost is 11. What should it do, absent constraints?", "Increase output", "Decrease output", "Shut down immediately", "The additional unit adds 3 to profit; expansion remains profitable while marginal revenue exceeds marginal cost.", "Profit maximum where MR = MC", "The equality is a marginal condition and must occur on the appropriate portion of the cost curve.", "profit-maximization"],
      ["shutdown-exit", "concept", "price covers average variable cost but remains below average total cost. What is the short-run decision?", "Continue operating while minimizing the loss", "Shut down because economic profit is negative", "Exit the industry immediately in every horizon", "Covering variable cost and part of fixed cost makes production preferable to shutting down in the short run.", "Operate in short run if P >= AVC", "Short-run shutdown and long-run exit use different cost thresholds.", "shutdown-decision"],
      ["scale", "concept", "long-run average cost declines as output expands. Which condition is present?", "Economies of scale", "Diseconomies of scale", "A rising marginal revenue curve necessarily", "Declining long-run average cost indicates that greater scale lowers average cost.", "", "Economies of scale are a long-run cost property, not a statement about current profitability.", "economies-scale"],
      ["perfect-competition", "concept", "a firm faces a horizontal demand curve at the market price and cannot affect that price. Which market structure is most consistent?", "Perfect competition", "Monopoly", "Oligopoly with a dominant firm", "A competitive firm is a price taker and faces perfectly elastic demand at the market price.", "P = MR for a competitive firm", "The market demand curve need not be horizontal even though the individual firm's demand curve is.", "perfect-competition"],
      ["monopoly", "concept", "why does an unregulated single-price monopolist generally produce less than the competitive quantity?", "It restricts output until marginal revenue equals marginal cost", "It sets price equal to marginal cost by definition", "Its marginal revenue always exceeds price", "Because marginal revenue lies below demand, profit maximization at MR = MC implies a higher price and lower quantity than the competitive outcome.", "MR = MC and price is read from demand", "Do not set monopoly price equal to marginal revenue.", "monopoly-output"],
      ["price-discrimination", "concept", "what is required for a firm to sustain price discrimination between customer groups?", "Market power, identifiable demand differences, and limited resale", "Perfectly elastic firm demand", "Identical willingness to pay and unrestricted arbitrage", "Price discrimination requires the ability to segment customers and prevent low-price buyers from reselling to high-price buyers.", "", "Different prices caused solely by different costs are not necessarily price discrimination.", "price-discrimination"],
      ["oligopoly", "concept", "each of two firms chooses its best response given the other firm's strategy and neither benefits from unilateral deviation. What outcome is described?", "A Nash equilibrium", "A perfectly competitive equilibrium necessarily", "A dominant strategy for both firms necessarily", "At a Nash equilibrium, every player's strategy is optimal given the strategies chosen by others.", "", "A Nash equilibrium need not maximize joint industry profit or social welfare.", "nash-equilibrium"],
      ["concentration", "calculation", "four firms have market shares of 40%, 30%, 20%, and 10%. What Herfindahl-Hirschman Index is correct?", "3,000", "100", "10,000", "HHI is 40^2 + 30^2 + 20^2 + 10^2 = 3,000 when percentage shares are squared.", "HHI = sum(si^2)", "State whether shares are decimals or percentages; the conventional percentage-share HHI ranges to 10,000.", "herfindahl-index"],
    ],
  },
  {
    id: "m013-business-cycles", code: "M013", title: "Understanding Business Cycles",
    definitions: [
      ["phase", "concept", "output is rising, employment is improving, and the negative output gap is narrowing. Which phase is most consistent?", "Expansion", "Contraction", "Trough as a single turning point", "Broad increases in production and employment with diminishing slack characterize an expansion.", "", "A phase is identified from a group of indicators rather than one noisy series.", "business-cycle-phase"],
      ["credit-cycle", "concept", "lending standards tighten, collateral values fall, and refinancing becomes difficult. What is the likely macroeconomic effect?", "The credit channel amplifies economic weakness", "Credit conditions automatically stabilize investment", "Potential output rises immediately", "Tighter credit reduces borrowing and spending while falling collateral weakens balance sheets, amplifying contraction.", "", "Credit cycles interact with business cycles but are not identical to them.", "credit-cycle"],
      ["inventories", "concept", "sales unexpectedly slow while production initially continues. What happens first to inventories?", "Unplanned inventories accumulate", "Inventories necessarily fall", "The inventory-sales ratio is unchanged", "When production exceeds realized sales, unsold goods accumulate and can prompt subsequent production cuts.", "", "Distinguish planned inventory investment from an involuntary buildup.", "inventory-cycle"],
      ["labor", "concept", "why is unemployment commonly a lagging indicator?", "Firms adjust hiring and layoffs after demand conditions have changed", "Workers forecast every turning point", "Employment has no relationship with output", "Adjustment costs and uncertainty cause firms to delay labor-force changes relative to shifts in demand and production.", "", "Initial claims may lead while the unemployment rate and duration often lag.", "labor-cycle"],
      ["capital-housing", "concept", "interest rates rise and expected demand weakens. Which spending categories are typically most exposed?", "Business fixed investment and housing", "Essential nondurable consumption only", "Government transfers necessarily", "Long-lived, financing-sensitive expenditures respond strongly to discount rates, credit availability, and expected utilization.", "", "Sensitivity varies with leverage, supply constraints, and the maturity of financing.", "investment-housing-cycle"],
      ["trade", "concept", "domestic income grows faster than foreign income, all else equal. What direction is most likely for the trade balance?", "It tends to weaken as imports rise faster", "It necessarily improves", "Exports rise solely because domestic demand rises", "Stronger domestic income stimulates imports, while slower foreign income restrains export demand.", "Net exports = exports - imports", "Exchange rates, relative prices, and trade elasticities can modify the result.", "net-exports-cycle"],
      ["inflation", "concept", "the economy operates above potential output and resource utilization is high. Which inflation pressure is most likely?", "Demand and capacity pressures tend to increase", "Deflation is guaranteed", "The output gap becomes more negative", "A positive output gap strains labor and productive capacity and can place upward pressure on wages and prices.", "", "Inflation may respond with lags and can also reflect supply shocks.", "cyclical-inflation"],
      ["indicators", "concept", "new orders weaken before production turns, while unemployment duration rises after the turn. How should the indicators be classified?", "New orders are leading and unemployment duration is lagging", "Both are coincident", "New orders are lagging and unemployment duration is leading", "Leading indicators tend to turn before activity; lagging indicators confirm changes after they occur.", "", "Classification is empirical and no indicator is infallible at every turning point.", "economic-indicators"],
      ["output-gap", "calculation", "actual output is 980 and estimated potential output is 1,000. What output gap as a percentage of potential is correct?", "-2.0%", "+2.0%", "-20.0%", "The output gap is (980 - 1,000)/1,000 = -2.0%, indicating economic slack.", "Output gap = (actual - potential) / potential", "Potential output is estimated and the sign must be interpreted explicitly.", "output-gap"],
      ["market-transmission", "concept", "the economy moves unexpectedly toward contraction. Which first-pass asset implication is most defensible, all else equal?", "Earnings expectations and cyclical risk premia may deteriorate", "Every bond and equity price must fall", "Long-term cash-flow forecasts are irrelevant", "A contraction can weaken earnings and raise risk aversion, but asset effects depend on valuation, policy response, duration, and prior expectations.", "", "Translate macro evidence through cash flows, discount rates, and expectations rather than using a deterministic phase rule.", "cycle-market-transmission"],
    ],
  },
  {
    id: "m014-fiscal-policy", code: "M014", title: "Fiscal Policy",
    definitions: [
      ["automatic-stabilizer", "concept", "tax receipts fall and unemployment benefits rise during a recession without new legislation. What mechanism is operating?", "Automatic fiscal stabilizers", "Discretionary monetary easing", "A balanced-budget amendment", "Existing tax and transfer rules automatically support disposable income when activity weakens.", "", "Automatic stabilizers change the actual budget balance without necessarily changing the structural policy stance.", "automatic-stabilizers"],
      ["discretionary", "concept", "the legislature approves a new infrastructure program to support aggregate demand. How should the action be classified?", "Discretionary expansionary fiscal policy", "An automatic stabilizer", "Contractionary monetary policy", "A deliberate legislative change in government spending is discretionary fiscal policy and is expansionary when it raises aggregate demand.", "", "Implementation timing and supply constraints affect the realized impact.", "discretionary-fiscal-policy"],
      ["spending-multiplier", "calculation", "the marginal propensity to consume is 0.75 in a simple closed-economy model without taxes. What spending multiplier is implied?", "4.00", "1.33", "0.75", "The simple expenditure multiplier is 1/(1 - 0.75) = 4.", "Spending multiplier = 1 / (1 - MPC)", "Leakages from taxes, imports, crowding out, and capacity constraints reduce real-world effects.", "spending-multiplier"],
      ["tax-multiplier", "calculation", "the marginal propensity to consume is 0.80 in the simple model. What tax multiplier is implied?", "-4.00", "+5.00", "-5.00", "The simple tax multiplier is -MPC/(1 - MPC) = -0.80/0.20 = -4.", "Tax multiplier = -MPC / (1 - MPC)", "The tax multiplier is negative because a tax increase reduces disposable income and consumption.", "tax-multiplier"],
      ["balanced-budget", "concept", "government purchases and lump-sum taxes rise by the same amount in the simple Keynesian model. What is the balanced-budget multiplier?", "Approximately one", "Zero", "Equal to the spending multiplier", "The positive spending effect exceeds the negative tax effect by one times the common change under the simple assumptions.", "Balanced-budget multiplier = 1", "The result depends on the restrictive assumptions of the simple model.", "balanced-budget-multiplier"],
      ["classification", "concept", "which item is a transfer rather than a direct government purchase of currently produced output?", "An unemployment benefit payment", "Construction of a public bridge", "Government purchase of medical equipment", "A transfer redistributes income without directly purchasing current goods or services.", "", "Transfers can affect aggregate demand indirectly through recipients' spending.", "government-spending-types"],
      ["crowding-out", "concept", "government borrowing raises market interest rates and private investment falls. What effect is described?", "Crowding out", "Ricardian equivalence through higher saving only", "An automatic stabilizer", "Deficit financing can increase the demand for funds and displace interest-sensitive private expenditure.", "", "The magnitude depends on monetary conditions, economic slack, capital flows, and private-sector sensitivity.", "crowding-out"],
      ["ricardian", "concept", "households save a tax cut because they expect offsetting future taxes. Which proposition does this behavior support?", "Ricardian equivalence", "The permanent-income multiplier is infinite", "Money neutrality by definition", "Ricardian equivalence argues that forward-looking households may offset debt-financed fiscal stimulus by increasing saving.", "", "Liquidity constraints, finite horizons, uncertainty, and distributional effects can weaken the proposition.", "ricardian-equivalence"],
      ["policy-lags", "concept", "economic weakness is identified quickly, but legislation takes months and projects start later. Which lags are evident?", "Action and impact lags", "Recognition lag only", "No fiscal lag", "Legislative delay is an action lag; the delay before spending affects activity is an impact lag.", "", "Recognition, action, and impact lags should be distinguished.", "fiscal-policy-lags"],
      ["structural-balance", "concept", "the budget deficit widens solely because recession lowers tax revenue and raises benefits. What happens to the structural balance, absent policy changes?", "It may remain broadly unchanged", "It must deteriorate by the same amount as the actual balance", "It necessarily moves to surplus", "The structural balance adjusts for cyclical effects and is intended to isolate the underlying discretionary stance.", "", "Estimating potential output and cyclical sensitivity introduces measurement uncertainty.", "structural-budget-balance"],
    ],
  },
  {
    id: "m015-monetary-policy", code: "M015", title: "Monetary Policy",
    definitions: [
      ["mandate", "concept", "why is price stability commonly a central-bank objective?", "It reduces inflation uncertainty and supports efficient long-horizon decisions", "It guarantees full employment at every moment", "It eliminates all asset-price volatility", "Stable prices improve the informational role of prices and reduce arbitrary redistribution and inflation-risk uncertainty.", "", "Price stability does not mean every individual price remains unchanged.", "price-stability"],
      ["open-market", "concept", "a central bank purchases government securities from the market. What is the intended immediate direction of reserves and short-term rates?", "Reserves rise and short-term rates face downward pressure", "Reserves fall and rates face upward pressure", "Both remain mechanically unchanged", "The purchase supplies reserves and eases short-term liquidity conditions.", "", "The broader transmission depends on bank behavior, expectations, credit demand, and market conditions.", "open-market-operations"],
      ["reserve-requirement", "concept", "the required reserve ratio is increased, all else equal. What is the likely direction of banks' lending capacity?", "It decreases", "It increases without limit", "It is unrelated to reserves", "A higher reserve requirement leaves a smaller share of deposits available to support lending.", "", "Modern operating frameworks may rely more heavily on administered rates and abundant reserves.", "reserve-requirement"],
      ["bank-transmission", "concept", "a policy-rate increase passes through to lending rates. What is the expected first-order effect on interest-sensitive spending?", "Borrowing and spending tend to weaken", "Borrowing necessarily accelerates", "Real rates must fall", "Higher borrowing costs reduce the present value of projects and discourage credit-financed consumption and investment.", "", "The effect depends on inflation expectations, balance sheets, refinancing structure, and credit supply.", "interest-rate-channel"],
      ["expectations-assets", "concept", "credible forward guidance convinces markets that rates will remain lower than previously expected. Which channel is operating most directly?", "The expectations channel, supporting longer-duration asset values", "The reserve-requirement channel only", "A fiscal tax multiplier", "Expected future short rates influence current longer-term yields and discount rates, affecting asset prices and spending.", "", "Guidance is effective only to the extent that it is credible and understood.", "expectations-channel"],
      ["exchange-rate", "concept", "domestic monetary policy unexpectedly tightens relative to foreign policy. What is a plausible near-term currency effect, all else equal?", "Domestic currency appreciation", "Domestic currency depreciation is guaranteed", "The exchange rate becomes fixed", "Higher relative yields can attract capital and support the domestic currency, though expectations and risk conditions matter.", "", "Currency effects are not deterministic and may already be priced.", "exchange-rate-channel"],
      ["credibility", "concept", "why can operational independence improve monetary-policy credibility?", "It can reduce pressure for short-term politically motivated expansion", "It eliminates accountability", "It guarantees forecast accuracy", "Independence can strengthen commitment to the stated mandate while accountability and transparency preserve legitimacy.", "", "Legal independence is insufficient without consistent decisions, communication, and institutional capacity.", "central-bank-credibility"],
      ["targeting", "concept", "under a credible inflation-targeting regime, realized inflation exceeds target because of a temporary supply shock. What is the strongest response principle?", "Explain the horizon and prevent second-round expectations from becoming unanchored", "Mechanically reverse the price-level shock immediately at any cost", "Ignore expectations because the shock is temporary", "Flexible inflation targeting distinguishes the initial shock from persistent propagation while maintaining medium-term credibility.", "", "Policy reacts to the outlook and transmission, not only the latest inflation observation.", "inflation-targeting"],
      ["liquidity-trap", "concept", "short-term policy rates are near their effective lower bound and money demand is highly elastic. Which policy issue arises?", "Conventional rate cuts have limited remaining traction", "Open-market purchases must raise rates", "Fiscal policy becomes impossible", "Near the lower bound, further conventional easing is constrained, motivating forward guidance or asset purchases.", "", "Unconventional policy still carries transmission, calibration, and exit risks.", "liquidity-trap"],
      ["policy-mix", "concept", "fiscal policy expands while monetary policy tightens. What is the most defensible market conclusion?", "The net effect depends on relative magnitude, expectations, and transmission channels", "Output and every asset price must rise", "The policies cancel exactly by definition", "An opposing policy mix affects demand, yields, currency, and risk premia through distinct channels whose net impact is empirical.", "", "Translate policy into cash flows and discount rates rather than assigning a deterministic asset direction.", "monetary-fiscal-mix"],
    ],
  },
  {
    id: "m016-geopolitics", code: "M016", title: "Introduction to Geopolitics",
    definitions: [
      ["cooperation", "concept", "states coordinate on a shared problem through negotiated rules while retaining national sovereignty. Where does this sit on the spectrum?", "Cooperation rather than autarky", "Complete noncooperation", "Hegemony by definition", "Negotiated rules and joint action indicate cooperation even though interests and bargaining power may differ.", "", "Cooperation does not imply identical objectives or the absence of enforcement problems.", "geopolitical-cooperation"],
      ["globalization", "concept", "cross-border trade, capital, information, and production networks deepen. Which structural trend is described?", "Globalization", "Autarky", "Economic nationalism necessarily", "Globalization increases international integration across markets and institutions.", "", "Globalization can coexist with regional blocs and selective national restrictions.", "globalization"],
      ["autarky", "concept", "a state seeks economic self-sufficiency and sharply restricts external trade and capital flows. Which posture is most consistent?", "Autarky", "Multilateralism", "Bilateral integration", "Autarky emphasizes domestic self-reliance and limited economic dependence on other states.", "", "Greater self-sufficiency can reduce some dependencies while raising costs and concentration risks.", "autarky"],
      ["hegemony", "concept", "one dominant state supplies key public goods and strongly shapes international rules. Which geopolitical structure is described?", "Hegemony", "Autarky", "A purely bilateral system", "A hegemon has sufficient power to influence institutions, norms, security, and economic arrangements.", "", "Hegemonic influence does not remove resistance, alliances, or transition risk.", "hegemony"],
      ["bilateral-multilateral", "concept", "three or more states negotiate under a standing international institution. Which arrangement is most accurate?", "Multilateralism", "Bilateralism", "Isolationism", "Multilateral arrangements coordinate multiple states through shared rules or institutions; bilateral arrangements involve two parties.", "", "The number of parties and institutional structure matter more than whether the agreement is cooperative.", "multilateralism"],
      ["imf", "concept", "a country faces a balance-of-payments crisis and seeks temporary financing with macroeconomic policy conditions. Which institution is most directly associated?", "International Monetary Fund", "World Trade Organization", "World Bank project-finance arm only", "The IMF supports international monetary stability and provides financing to members facing external-payment difficulties.", "", "Distinguish stabilization financing from long-horizon development lending and trade-rule adjudication.", "international-monetary-fund"],
      ["world-bank", "concept", "a lower-income country seeks long-term financing for development infrastructure and institutional capacity. Which institution is most directly relevant?", "World Bank Group", "International Monetary Fund for short-term stabilization only", "World Trade Organization", "The World Bank focuses on long-term development, poverty reduction, and project or policy financing.", "", "Institutional mandates overlap at the margins but their primary purposes differ.", "world-bank"],
      ["wto", "concept", "states dispute whether a tariff violates agreed international trade rules. Which institution provides the most directly relevant framework?", "World Trade Organization", "International Monetary Fund", "A domestic central bank", "The WTO administers trade agreements and provides a framework for negotiation and dispute settlement.", "", "A legal trade ruling does not by itself determine the portfolio impact.", "world-trade-organization"],
      ["risk-type", "concept", "a sudden coup creates an abrupt country-specific disruption. How is the geopolitical risk best classified?", "Event risk", "Thematic risk only", "A recurring seasonal factor", "A discrete political rupture is event risk; thematic risks evolve through persistent structural forces.", "", "Risk classification should lead to exposure mapping rather than replace it.", "geopolitical-event-risk"],
      ["transmission", "concept", "what is the strongest sequence for converting a geopolitical development into an investment conclusion?", "Identify event, exposure, transmission channel, likelihood, impact, velocity, and valuation effect", "Assign a dramatic label and trade immediately", "Forecast one precise outcome and ignore alternatives", "Decision-useful analysis maps the event through affected exposures into cash flows, discount rates, liquidity, and risk premia under scenarios.", "", "Avoid false precision; distinguish probability, severity, speed, and market pricing.", "geopolitical-transmission"],
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
const allPrompts = [];
for (const module of modules) {
  if (module.definitions.length !== 10) {
    throw new Error(`${module.id} must define exactly 10 learning objectives.`);
  }
  const questions = module.definitions.flatMap((definition, definitionIndex) =>
    contexts.map((_, variant) => makeQuestion(module.id, definition, variant, definitionIndex))
  );
  const bank = parsePracticeBankDraft({
    schemaVersion: 1,
    id: `session-03-${module.id}-expanded`,
    version: "s03-2026-09-13-v2",
    title: `Session 03 | ${module.code} ${module.title}`,
    topic: module.title,
    moduleIds: [module.id],
    sourceSessionIds: ["session-03"],
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
  const filename = `Hamad_CFA_Level_I_Session_03_${module.code}_Expanded_Practice.json`;
  fs.writeFileSync(path.join(output, filename), `${JSON.stringify(bank, null, 2)}\n`);
  allPrompts.push(...questions.map(question => question.prompt));
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

let maximumCrossBankSimilarity = 0;
for (let left = 0; left < allPrompts.length; left += 1) {
  for (let right = left + 1; right < allPrompts.length; right += 1) {
    maximumCrossBankSimilarity = Math.max(
      maximumCrossBankSimilarity,
      questionSimilarity(allPrompts[left], allPrompts[right]),
    );
  }
}
if (allPrompts.length !== 350 || new Set(allPrompts).size !== 350) {
  throw new Error("Session 03 expansion must contain exactly 350 unique prompts.");
}
if (maximumCrossBankSimilarity >= 0.88) {
  throw new Error(`Cross-bank near-duplicate detected (${maximumCrossBankSimilarity.toFixed(3)}).`);
}

fs.writeFileSync(path.join(output, "Session_03_Expanded_Practice_QA_Report.json"), `${JSON.stringify({
  generatedAt: new Date().toISOString(),
  expectedQuestionsPerModule: 50,
  expectedTotalQuestions: 350,
  sessionSimilarityThreshold: 0.68,
  internalNearDuplicateThreshold: 0.88,
  maximumCrossBankSimilarity: Number(maximumCrossBankSimilarity.toFixed(3)),
  tutorOnlyFields: 0,
  banks: report,
}, null, 2)}\n`);

console.log(report.map(item =>
  `${item.moduleId}: ${item.questions} questions; max Session Mode similarity ${item.maximumSessionSimilarity}; max original-practice similarity ${item.maximumExistingPracticeSimilarity}`
).join("\n"));
