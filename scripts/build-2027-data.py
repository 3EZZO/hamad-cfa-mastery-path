"""Build the official 2027 curriculum catalog and 27-week tutoring plan.

The public CFA Institute 2027 Level I Topic Outlines are the module-title
authority. Full curriculum lessons, examples, questions, and Equation
Explorers remain inside the candidate's registered Learning Ecosystem.
"""

from __future__ import annotations

import json
from datetime import date, timedelta
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "src" / "data"
OUTLINE_URL = (
    "https://www.cfainstitute.org/sites/default/files/"
    "2027levelitopicoutline_online.pdf"
)
ERRATA_URL = (
    "https://www.cfainstitute.org/programs/candidate-resources/submit-errata"
)


MODULES: dict[str, list[tuple[str, int]]] = {
    "Quantitative Methods": [
        ("Returns of Financial Assets and Instruments", 1),
        ("Types of Financial Returns", 1),
        ("Benchmarking Returns", 1),
        ("The Time Value of Money in Finance", 1),
        ("Statistical Characteristics of Asset Returns", 2),
        ("Statistical Distributions for Financial Asset Prices and Returns", 2),
        ("Estimation and Hypothesis Testing", 2),
        ("The Return and Risk of a Financial Portfolio", 2),
        ("Simulation of Financial Asset Prices and Returns", 2),
        ("Applications of Simple Linear Regression in Finance", 3),
        ("Introduction to Financial Data Science", 3),
    ],
    "Economics": [
        ("The Firm and Market Structures", 5),
        ("Understanding Business Cycles", 5),
        ("Fiscal Policy", 6),
        ("Monetary Policy", 6),
        ("Introduction to Geopolitics", 6),
        ("International Trade", 6),
        ("Capital Flows and the FX Market", 6),
        ("Exchange Rate Calculations", 7),
    ],
    "Corporate Issuers": [
        ("Organizational Forms, Corporate Issuer Features, and Ownership", 9),
        ("Investors and Other Stakeholders", 9),
        ("Corporate Governance: Conflicts, Mechanisms, Risks, and Benefits", 9),
        ("Working Capital and Liquidity", 10),
        ("Capital Investments and Capital Allocation", 10),
        ("Capital Structure", 10),
        ("Business Models", 10),
    ],
    "Financial Statement Analysis": [
        ("Introduction to Financial Statement Analysis", 11),
        ("Analyzing Income Statements", 11),
        ("Analyzing Balance Sheets", 12),
        ("Analyzing Statements of Cash Flows I", 12),
        ("Analyzing Statements of Cash Flows II", 12),
        ("Analysis of Inventories", 12),
        ("Analysis of Long-Term Assets", 12),
        ("Topics in Long-Term Liabilities and Equity", 13),
        ("Analysis of Income Taxes", 13),
        ("Financial Reporting Quality", 13),
        ("Financial Analysis Techniques", 13),
        ("Introduction to Financial Statement Modeling", 14),
    ],
    "Equity Investments": [
        ("Equity Instrument Features", 15),
        ("Equity Jurisdictions, Classes, and the Voting Process", 15),
        ("Equity Issuance and Trading", 15),
        ("Sources of Equity Returns", 16),
        ("Introduction to Equity Valuation", 16),
        ("Discounted Cash Flow (DCF) and Growth Models", 16),
        ("Relative Value Equity Valuation Approaches", 16),
        ("Financial Statement Forecasting in Equity Valuation", 16),
        ("Industry and Competitive Analysis", 17),
        ("Company Analysis: Past, Present, and Future", 17),
        ("Equity Analyst Research Reports", 17),
        (
            "The Capital Asset Pricing Model, Market Model, and Other "
            "Factor-Based Equity Models",
            17,
        ),
    ],
    "Fixed Income": [
        ("Fixed-Income Instrument Features", 19),
        ("Fixed-Income Cash Flows and Types", 19),
        ("Fixed-Income Issuance and Trading", 19),
        ("Fixed-Income Markets for Corporate Issuers", 20),
        ("Fixed-Income Markets for Government Issuers", 20),
        ("Fixed-Income Bond Valuation: Prices and Yields", 20),
        ("Yield and Yield Spread Measures for Fixed-Rate Bonds", 20),
        ("Yield and Yield Spread Measures for Floating-Rate Instruments", 20),
        ("The Term Structure of Interest Rates: Spot, Par, and Forward Curves", 20),
        ("Interest Rate Risk and Return", 20),
        ("Yield-Based Bond Duration Measures and Properties", 21),
        ("Yield-Based Bond Convexity and Portfolio Properties", 21),
        ("Curve-Based and Empirical Fixed-Income Risk Measures", 21),
        ("Credit Risk", 21),
        ("Credit Analysis for Government Issuers", 21),
        ("Credit Analysis for Corporate Issuers", 21),
        ("Fixed-Income Securitization", 21),
        ("Asset-Backed Security (ABS) Instrument and Market Features", 22),
        ("Mortgage-Backed Security (MBS) Instrument and Market Features", 22),
    ],
    "Derivatives": [
        ("Derivative Instrument and Derivative Market Features", 23),
        ("Forward Commitment and Contingent Claim Features and Instruments", 23),
        ("Derivative Benefits, Risks, and Issuer and Investor Uses", 23),
        ("Arbitrage, Replication, and the Cost of Carry in Pricing Derivatives", 23),
        (
            "Pricing and Valuation of Forward Contracts and for an Underlying "
            "with Varying Maturities",
            24,
        ),
        ("Pricing and Valuation of Futures Contracts", 24),
        ("Pricing and Valuation of Interest Rate and Other Swaps", 24),
        ("Pricing and Valuation of Options", 24),
        ("Option Replication Using Put-Call Parity", 24),
        ("Valuing a Derivative Using a One-Period Binomial Model", 24),
    ],
    "Alternative Investments": [
        ("Alternative Investment Features, Methods, and Structures", 25),
        ("Alternative Investment Performance and Returns", 25),
        ("Investments in Private Capital: Equity and Debt", 25),
        ("Real Estate and Infrastructure", 25),
        ("Natural Resources", 26),
        ("Hedge Funds", 26),
        ("Introduction to Digital Assets", 26),
    ],
    "Portfolio Management": [
        ("Portfolio Risk and Return: Part I", 27),
        ("Portfolio Risk and Return: Part II", 27),
        ("Portfolio Management: An Overview", 28),
        ("Basics of Portfolio Planning and Construction", 28),
        ("The Behavioral Biases of Individuals", 28),
        ("Introduction to Risk Management", 28),
    ],
    "Ethical and Professional Standards": [
        ("Ethics and Trust in the Investment Profession", 29),
        ("Code of Ethics and Standards of Professional Conduct", 29),
        ("Guidance for Standard I: Professionalism", 30),
        ("Guidance for Standard II: Integrity of Capital Markets", 30),
        ("Guidance for Standard III: Duties to Clients", 30),
        ("Guidance for Standard IV: Duties to Employers", 30),
        (
            "Guidance for Standard V: Investment Analysis, Recommendations, "
            "and Actions",
            30,
        ),
        ("Guidance for Standard VI: Conflicts of Interest", 30),
        (
            "Guidance for Standard VII: Responsibilities as a CFA Institute "
            "Member or CFA Candidate",
            31,
        ),
        ("Application of the Code and Standards: Level I", 31),
    ],
}


def coverage_session(title: str, objective: str, modules: list[str], duration: int = 90) -> dict:
    return {
        "title": title,
        "objective": objective,
        "modules": modules,
        "durationMinutes": duration,
    }


def coaching_session(title: str, objective: str, duration: int = 90) -> dict:
    return {
        "title": title,
        "objective": objective,
        "modules": [],
        "durationMinutes": duration,
    }


WEEKS: list[dict] = [
    {
        "focus": "Quantitative Methods I: returns, benchmarking, time value, and distributions",
        "topics": ["Quantitative Methods"],
        "sessions": [
            coverage_session(
                "2027 Quant Module 1: returns and return types",
                "Begin directly with the first official 2027 module and build a clean return vocabulary and calculation process.",
                ["Returns of Financial Assets and Instruments", "Types of Financial Returns"],
            ),
            coverage_session(
                "Benchmarking returns and time value of money",
                "Connect benchmark construction, money-weighted and time-weighted returns, and present-value logic.",
                ["Benchmarking Returns", "The Time Value of Money in Finance"],
            ),
            coverage_session(
                "Return statistics and distributions",
                "Interpret central tendency, dispersion, shape, and distributions before applying them under time pressure.",
                [
                    "Statistical Characteristics of Asset Returns",
                    "Statistical Distributions for Financial Asset Prices and Returns",
                ],
            ),
        ],
        "questionTarget": 180,
        "masteryGate": "At least 75% on fresh Quant questions with every calculator step reproducible.",
    },
    {
        "focus": "Quantitative Methods II: inference, portfolios, simulation, regression, and data science",
        "topics": ["Quantitative Methods"],
        "sessions": [
            coverage_session(
                "Estimation and hypothesis testing",
                "Choose the correct estimator or test, state hypotheses correctly, and interpret statistical evidence.",
                ["Estimation and Hypothesis Testing"],
            ),
            coverage_session(
                "Portfolio return, risk, and simulation",
                "Calculate portfolio risk and understand historical simulation, bootstrapping, and Monte Carlo logic.",
                [
                    "The Return and Risk of a Financial Portfolio",
                    "Simulation of Financial Asset Prices and Returns",
                ],
            ),
            coverage_session(
                "Regression and financial data science",
                "Interpret simple regression and build the 2027 vocabulary for data, machine learning, AI, and large language models.",
                [
                    "Applications of Simple Linear Regression in Finance",
                    "Introduction to Financial Data Science",
                ],
            ),
        ],
        "questionTarget": 200,
        "masteryGate": "Complete two separated Quant sets at 75% or better with no recurring process error.",
    },
    {
        "focus": "Economics: firms, cycles, policy, geopolitics, trade, and currencies",
        "topics": ["Economics"],
        "sessions": [
            coverage_session(
                "Market structures and business cycles",
                "Link firm behavior, market structure, cycle phases, and indicator interpretation.",
                ["The Firm and Market Structures", "Understanding Business Cycles"],
            ),
            coverage_session(
                "Fiscal policy, monetary policy, and geopolitics",
                "Separate policy tools and transmission channels while integrating geopolitical risk.",
                ["Fiscal Policy", "Monetary Policy", "Introduction to Geopolitics"],
            ),
            coverage_session(
                "Trade, capital flows, and exchange rates",
                "Work from international trade through FX markets to cross-rate and forward-rate calculations.",
                ["International Trade", "Capital Flows and the FX Market", "Exchange Rate Calculations"],
            ),
        ],
        "questionTarget": 180,
        "masteryGate": "Explain the policy-to-market chain and score 72% or better on a fresh Economics set.",
    },
    {
        "focus": "Corporate Issuers: ownership, governance, liquidity, capital allocation, and business models",
        "topics": ["Corporate Issuers"],
        "sessions": [
            coverage_session(
                "Issuer forms, stakeholders, and governance",
                "Map ownership structures, stakeholder claims, conflicts, controls, and governance outcomes.",
                [
                    "Organizational Forms, Corporate Issuer Features, and Ownership",
                    "Investors and Other Stakeholders",
                    "Corporate Governance: Conflicts, Mechanisms, Risks, and Benefits",
                ],
            ),
            coverage_session(
                "Liquidity, capital allocation, structure, and business models",
                "Connect operating liquidity, investment decisions, financing choices, and value creation.",
                ["Working Capital and Liquidity", "Capital Investments and Capital Allocation", "Capital Structure", "Business Models"],
            ),
        ],
        "questionTarget": 160,
        "masteryGate": "Produce a one-page corporate decision map and clear 72% on fresh questions.",
    },
    {
        "focus": "Financial Statement Analysis I: statements and cash-flow linkage",
        "topics": ["Financial Statement Analysis"],
        "sessions": [
            coverage_session(
                "FSA framework and income statements",
                "Apply the analysis framework and trace recognition choices through earnings quality.",
                ["Introduction to Financial Statement Analysis", "Analyzing Income Statements"],
            ),
            coverage_session(
                "Balance sheets and cash-flow statements",
                "Reconcile the three statements and classify cash flows consistently.",
                ["Analyzing Balance Sheets", "Analyzing Statements of Cash Flows I", "Analyzing Statements of Cash Flows II"],
            ),
        ],
        "questionTarget": 200,
        "masteryGate": "Reconstruct statement links without notes and score 75% on a fresh FSA set.",
    },
    {
        "focus": "Financial Statement Analysis II: assets, liabilities, tax, and reporting quality",
        "topics": ["Financial Statement Analysis"],
        "sessions": [
            coverage_session(
                "Inventories and long-term assets",
                "Normalize accounting choices and explain their ratio and cash-flow effects.",
                ["Analysis of Inventories", "Analysis of Long-Term Assets"],
            ),
            coverage_session(
                "Long-term obligations, equity, and income taxes",
                "Analyze financing obligations, equity effects, and deferred-tax relationships.",
                ["Topics in Long-Term Liabilities and Equity", "Analysis of Income Taxes"],
            ),
            coverage_session(
                "Financial reporting quality",
                "Distinguish reporting quality, earnings quality, bias, warning signs, and corrective adjustments.",
                ["Financial Reporting Quality"],
            ),
        ],
        "questionTarget": 220,
        "masteryGate": "No repeated classification error across inventory, assets, liabilities, tax, or reporting quality.",
    },
    {
        "focus": "Financial Statement Analysis III: techniques and modeling",
        "topics": ["Financial Statement Analysis"],
        "sessions": [
            coverage_session(
                "Financial analysis techniques",
                "Select, calculate, interpret, and connect activity, liquidity, solvency, and profitability measures.",
                ["Financial Analysis Techniques"],
            ),
            coverage_session(
                "Financial statement modeling and FSA integration",
                "Build a sales-based pro forma model and integrate forecasting judgments with the full FSA framework.",
                ["Introduction to Financial Statement Modeling"],
            ),
        ],
        "questionTarget": 200,
        "masteryGate": "Complete the cumulative FSA assessment at 75% or better and repair every material miss.",
    },
    {
        "focus": "Equity Investments I: instruments, rights, trading, and return sources",
        "topics": ["Equity Investments"],
        "sessions": [
            coverage_session(
                "Equity instruments, jurisdictions, classes, and voting",
                "Differentiate economic and voting rights across public, private, jurisdictional, and class structures.",
                ["Equity Instrument Features", "Equity Jurisdictions, Classes, and the Voting Process"],
            ),
            coverage_session(
                "Equity issuance, trading, indexes, and return sources",
                "Connect primary and secondary markets, liquidity, index structure, and drivers of equity return.",
                ["Equity Issuance and Trading", "Sources of Equity Returns"],
            ),
        ],
        "questionTarget": 180,
        "masteryGate": "Explain the path from issuance to investor return and clear 72% on fresh questions.",
    },
    {
        "focus": "Equity Investments II: valuation and forecasting",
        "topics": ["Equity Investments"],
        "sessions": [
            coverage_session(
                "Equity valuation and DCF growth models",
                "Anchor valuation in cash flows, growth, required return, and explicit model assumptions.",
                ["Introduction to Equity Valuation", "Discounted Cash Flow (DCF) and Growth Models"],
            ),
            coverage_session(
                "Relative valuation and financial statement forecasting",
                "Choose comparables and connect disaggregated forecasts to valuation outputs and scenarios.",
                ["Relative Value Equity Valuation Approaches", "Financial Statement Forecasting in Equity Valuation"],
            ),
            coverage_session(
                "Industry and competitive analysis",
                "Use industry structure, Porter analysis, and PESTLE evidence to support a valuation narrative.",
                ["Industry and Competitive Analysis"],
            ),
        ],
        "questionTarget": 220,
        "masteryGate": "Build and defend one concise valuation bridge, then score 75% on a fresh Equity set.",
    },
    {
        "focus": "Equity Investments III: company analysis, research reports, and factor models",
        "topics": ["Equity Investments"],
        "sessions": [
            coverage_session(
                "Company analysis and equity research reports",
                "Turn historical evidence and forecasts into an investment thesis and structured research report.",
                ["Company Analysis: Past, Present, and Future", "Equity Analyst Research Reports"],
            ),
            coverage_session(
                "CAPM, market model, factor models, and Equity integration",
                "Estimate cost of equity, interpret factor exposures, and connect the result to valuation.",
                ["The Capital Asset Pricing Model, Market Model, and Other Factor-Based Equity Models"],
            ),
        ],
        "questionTarget": 220,
        "masteryGate": "Complete the cumulative Equity assessment at 75% or better with a written repair plan.",
    },
    {
        "focus": "Fixed Income I: instruments, markets, valuation, and yields",
        "topics": ["Fixed Income"],
        "sessions": [
            coverage_session(
                "Fixed-income features and cash flows",
                "Read indentures, classify structures, and model promised and contingent cash flows.",
                ["Fixed-Income Instrument Features", "Fixed-Income Cash Flows and Types"],
            ),
            coverage_session(
                "Issuance and corporate and government markets",
                "Compare issuance, trading, funding, and market structures across issuer types.",
                ["Fixed-Income Issuance and Trading", "Fixed-Income Markets for Corporate Issuers", "Fixed-Income Markets for Government Issuers"],
            ),
            coverage_session(
                "Bond valuation and fixed-rate yield spreads",
                "Calculate prices, yields, and spreads and explain their economic meaning.",
                ["Fixed-Income Bond Valuation: Prices and Yields", "Yield and Yield Spread Measures for Fixed-Rate Bonds"],
            ),
        ],
        "questionTarget": 220,
        "masteryGate": "Price and interpret a bond cleanly from a timeline and clear 75% on fresh questions.",
    },
    {
        "focus": "Fixed Income II: curves, floating-rate instruments, duration, and convexity",
        "topics": ["Fixed Income"],
        "sessions": [
            coverage_session(
                "Floating-rate yields and the term structure",
                "Interpret floating-rate margins and construct spot, par, and forward relationships.",
                ["Yield and Yield Spread Measures for Floating-Rate Instruments", "The Term Structure of Interest Rates: Spot, Par, and Forward Curves"],
            ),
            coverage_session(
                "Interest-rate risk, duration, and convexity",
                "Translate yield changes into price risk using duration and convexity at instrument and portfolio level.",
                ["Interest Rate Risk and Return", "Yield-Based Bond Duration Measures and Properties", "Yield-Based Bond Convexity and Portfolio Properties"],
            ),
        ],
        "questionTarget": 220,
        "masteryGate": "Explain curve and sensitivity effects before calculating them, with 75% fresh-set accuracy.",
    },
    {
        "focus": "Fixed Income III: empirical risk, credit, securitization, ABS, and MBS",
        "topics": ["Fixed Income"],
        "sessions": [
            coverage_session(
                "Curve-based risk and credit risk",
                "Compare empirical and analytical rate-risk measures and identify sources of credit loss.",
                ["Curve-Based and Empirical Fixed-Income Risk Measures", "Credit Risk"],
            ),
            coverage_session(
                "Credit analysis and securitization",
                "Apply sovereign and corporate credit frameworks and trace assets through a securitization structure.",
                ["Credit Analysis for Government Issuers", "Credit Analysis for Corporate Issuers", "Fixed-Income Securitization"],
            ),
            coverage_session(
                "ABS and MBS instruments",
                "Map collateral, tranching, prepayment, extension, contraction, and cash-flow risk.",
                ["Asset-Backed Security (ABS) Instrument and Market Features", "Mortgage-Backed Security (MBS) Instrument and Market Features"],
            ),
        ],
        "questionTarget": 240,
        "masteryGate": "Complete the cumulative Fixed Income assessment at 75% or better and verify every repair.",
    },
    {
        "focus": "Derivatives: instruments, pricing, valuation, parity, and binomial logic",
        "topics": ["Derivatives"],
        "sessions": [
            coverage_session(
                "Derivative markets, instruments, benefits, and risks",
                "Classify derivatives, compare market structures, and identify issuer and investor uses.",
                ["Derivative Instrument and Derivative Market Features", "Forward Commitment and Contingent Claim Features and Instruments", "Derivative Benefits, Risks, and Issuer and Investor Uses"],
            ),
            coverage_session(
                "Arbitrage, carry, forwards, and futures",
                "Use replication and cost-of-carry logic to price and value forward commitments.",
                ["Arbitrage, Replication, and the Cost of Carry in Pricing Derivatives", "Pricing and Valuation of Forward Contracts and for an Underlying with Varying Maturities", "Pricing and Valuation of Futures Contracts"],
            ),
            coverage_session(
                "Swaps, options, put-call parity, and binomial valuation",
                "Price and value swaps and options, apply parity, and solve a one-period binomial tree.",
                ["Pricing and Valuation of Interest Rate and Other Swaps", "Pricing and Valuation of Options", "Option Replication Using Put-Call Parity", "Valuing a Derivative Using a One-Period Binomial Model"],
            ),
        ],
        "questionTarget": 190,
        "masteryGate": "Draw the payoff or cash-flow logic before calculation and clear 72% on fresh Derivatives questions.",
    },
    {
        "focus": "Alternative Investments: structures, returns, private markets, real assets, and diversifiers",
        "topics": ["Alternative Investments"],
        "sessions": [
            coverage_session(
                "Alternative structures, performance, and private capital",
                "Compare ownership and fee structures, calculate returns, and distinguish private equity and debt.",
                ["Alternative Investment Features, Methods, and Structures", "Alternative Investment Performance and Returns", "Investments in Private Capital: Equity and Debt"],
            ),
            coverage_session(
                "Real assets, hedge funds, and digital assets",
                "Compare the return, risk, liquidity, diversification, and vehicle features of alternative categories.",
                ["Real Estate and Infrastructure", "Natural Resources", "Hedge Funds", "Introduction to Digital Assets"],
            ),
        ],
        "questionTarget": 160,
        "masteryGate": "Classify each alternative by vehicle, liquidity, valuation, risk, and diversification role.",
    },
    {
        "focus": "Portfolio Management: portfolio risk, construction, behavior, and risk governance",
        "topics": ["Portfolio Management"],
        "sessions": [
            coverage_session(
                "Portfolio risk and return I and II",
                "Build portfolios from covariance through the efficient frontier, CAL, CML, beta, and CAPM.",
                ["Portfolio Risk and Return: Part I", "Portfolio Risk and Return: Part II"],
            ),
            coverage_session(
                "Portfolio process, planning, behavioral biases, and risk management",
                "Connect investor objectives and constraints to construction, behavioral risk, and governance.",
                ["Portfolio Management: An Overview", "Basics of Portfolio Planning and Construction", "The Behavioral Biases of Individuals", "Introduction to Risk Management"],
            ),
        ],
        "questionTarget": 180,
        "masteryGate": "Write an IPS-to-portfolio decision chain and score 75% on a fresh Portfolio set.",
    },
    {
        "focus": "Ethics I: trust, the Code and Standards, Professionalism, and market integrity",
        "topics": ["Ethical and Professional Standards"],
        "sessions": [
            coverage_session(
                "Ethics, trust, and the Code and Standards",
                "Use a fact-duty-action framework and master the structure of the Code and Standards.",
                ["Ethics and Trust in the Investment Profession", "Code of Ethics and Standards of Professional Conduct"],
            ),
            coverage_session(
                "Standards I and II",
                "Apply the updated 2027 guidance for Professionalism and Integrity of Capital Markets.",
                ["Guidance for Standard I: Professionalism", "Guidance for Standard II: Integrity of Capital Markets"],
            ),
        ],
        "questionTarget": 180,
        "masteryGate": "State the controlling duty before choosing an answer and clear 75% on fresh Ethics cases.",
    },
    {
        "focus": "Ethics II: duties, conflicts, candidate responsibilities, and integrated application",
        "topics": ["Ethical and Professional Standards"],
        "sessions": [
            coverage_session(
                "Standards III, IV, and V",
                "Apply duties to clients and employers and the requirements for investment analysis and communication.",
                ["Guidance for Standard III: Duties to Clients", "Guidance for Standard IV: Duties to Employers", "Guidance for Standard V: Investment Analysis, Recommendations, and Actions"],
            ),
            coverage_session(
                "Standards VI and VII and Level I application",
                "Resolve conflicts, member and candidate responsibilities, and integrated cases using the updated guidance.",
                ["Guidance for Standard VI: Conflicts of Interest", "Guidance for Standard VII: Responsibilities as a CFA Institute Member or CFA Candidate", "Application of the Code and Standards: Level I"],
            ),
        ],
        "questionTarget": 220,
        "masteryGate": "Complete the cumulative Ethics benchmark at 78% or better and explain every corrected answer.",
    },
    {
        "focus": "Full-curriculum integration and topic switching",
        "topics": ["Mixed Curriculum"],
        "sessions": [
            coaching_session("Integrated decision maps", "Connect Quant, FSA, Equity, Fixed Income, Portfolio, and Ethics into reusable decision processes."),
            coaching_session("Ninety-question switching debrief", "Review timing, confidence, and topic-switching evidence from a timed mixed assessment."),
        ],
        "questionTarget": 300,
        "masteryGate": "No topic below 65%, overall at least 72%, and every material miss classified and scheduled for repair.",
    },
    {
        "focus": "Official 2027 coverage gate and weakest-topic repair",
        "topics": ["Mixed Curriculum"],
        "sessions": [
            coaching_session("102-module coverage audit", "Verify that every official 2027 module has learning, practice, review, and recall evidence."),
            coaching_session("Coverage gate and repair release", "Test the three weakest clusters and approve the mock campaign only after evidence closes the gaps."),
        ],
        "questionTarget": 360,
        "masteryGate": "All 102 modules have evidence and every topic has two separated passing sets or an active repair plan.",
    },
    {
        "focus": "Mock 1: establish the full-exam execution baseline",
        "topics": ["Mixed Curriculum"],
        "sessions": [
            coaching_session("Mock 1 preparation and execution brief", "Lock conditions, pacing, skip-return rules, confidence capture, and the independent mock appointment.", 75),
            coaching_session("Mock 1 forensic debrief", "Reconstruct decisions, classify lost points, and prescribe the highest-value repairs.", 105),
        ],
        "questionTarget": 300,
        "masteryGate": "Mock 1 is fully debriefed; every material miss has a cause, correction rule, and retest date.",
        "mock": 1,
    },
    {
        "focus": "Mock 2: eliminate repeated errors",
        "topics": ["Mixed Curriculum"],
        "sessions": [
            coaching_session("Mock 2 preparation and execution brief", "Run the corrected pacing and decision rules under independent exam conditions.", 75),
            coaching_session("Mock 2 forensic debrief", "Measure recurrence, timing, confidence calibration, and transfer from Mock 1 repairs.", 105),
        ],
        "questionTarget": 300,
        "masteryGate": "No unexamined repeated error; recurring clusters move into the deep-repair week.",
        "mock": 2,
    },
    {
        "focus": "Deep repair: convert Mock 1 and 2 evidence into a stronger floor",
        "topics": ["Mixed Curriculum"],
        "sessions": [
            coaching_session("Two-mock pattern synthesis", "Rank recurring errors by frequency, value, confidence, and repairability."),
            coaching_session("Deep repair and transfer verification", "Re-teach the highest-value clusters and verify transfer on fresh mixed questions.", 105),
        ],
        "questionTarget": 240,
        "masteryGate": "The top recurring clusters pass delayed retests and no topic floor is below 65%.",
    },
    {
        "focus": "Mock 3: build a stable scoring floor",
        "topics": ["Mixed Curriculum"],
        "sessions": [
            coaching_session("Mock 3 preparation and execution brief", "Protect routine and test whether the rebuilt topic floor survives time pressure.", 75),
            coaching_session("Mock 3 forensic debrief", "Separate knowledge, process, timing, and confidence losses and assign focused repairs.", 105),
        ],
        "questionTarget": 300,
        "masteryGate": "Overall evidence and topic floors improve without a new repeated-error cluster.",
        "mock": 3,
    },
    {
        "focus": "Mock 4: convert knowledge into timed performance",
        "topics": ["Mixed Curriculum"],
        "sessions": [
            coaching_session("Mock 4 preparation and execution brief", "Use the settled two-session exam routine with strict pacing and break discipline.", 75),
            coaching_session("Mock 4 forensic debrief", "Audit time allocation, changed answers, low-confidence wins, and avoidable losses.", 105),
        ],
        "questionTarget": 300,
        "masteryGate": "Pacing is stable and the result is supported by explainable, repeatable decisions.",
        "mock": 4,
    },
    {
        "focus": "Mock 5: readiness under pressure",
        "topics": ["Mixed Curriculum"],
        "sessions": [
            coaching_session("Mock 5 preparation and execution brief", "Simulate the appointment routine, nutrition, break, and second-session reset.", 75),
            coaching_session("Mock 5 forensic debrief", "Test the stability of high-weight topics and close the smallest set of decisive gaps.", 105),
        ],
        "questionTarget": 300,
        "masteryGate": "Readiness is supported across overall score, topic floors, timing, and confidence calibration.",
        "mock": 5,
    },
    {
        "focus": "Mock 6: prove repeatable readiness",
        "topics": ["Mixed Curriculum"],
        "sessions": [
            coaching_session("Mock 6 launch and final-condition checklist", "Confirm exact conditions and select the few behaviors that must remain automatic.", 75),
            coaching_session("Mock 6 forensic debrief", "Compare the result with the prior three mocks and isolate only evidence-backed repairs.", 105),
            coaching_session("Mock 6 repair verification", "Retest decisive weaknesses and freeze any topic that has earned release.", 75),
        ],
        "questionTarget": 300,
        "masteryGate": "Two recent mocks show a stable readiness range and no critical topic floor remains hidden.",
        "mock": 6,
    },
    {
        "focus": "Mock 7: final proof and taper handoff",
        "topics": ["Mixed Curriculum"],
        "sessions": [
            coaching_session("Mock 7 launch and calm-execution brief", "Run the final full rehearsal without introducing a new strategy.", 75),
            coaching_session("Mock 7 forensic debrief", "Extract only high-value lessons and reject low-value panic repairs.", 105),
            coaching_session("Final containment and taper handoff", "Freeze the plan, define the light-review list, and protect confidence, sleep, and logistics.", 75),
        ],
        "questionTarget": 300,
        "masteryGate": "The final evidence supports taper; unresolved items are narrow, explicit, and low-risk.",
        "mock": 7,
    },
    {
        "focus": "Exam week: taper, protect the work, and execute",
        "topics": ["Mixed Curriculum", "Ethical and Professional Standards"],
        "sessions": [
            coaching_session("Confidence review and final decision rules", "Use light retrieval to confirm high-value rules without reopening the curriculum.", 60),
            coaching_session("Pre-exam logistics and calm-execution check", "Confirm documents, travel, sleep, food, break plan, and the first-minute routine for exam day.", 45),
        ],
        "questionTarget": 60,
        "masteryGate": "Stop heavy work, preserve sleep, and arrive with the rehearsed plan intact.",
    },
]


def scheduled_weeks() -> list[dict]:
    """Reflow the topical blueprint into the fixed 27-week program window.

    All official modules remain in published order as independent study. The
    first 26 weeks each end with one Saturday checkpoint; Week 27 is a
    session-free taper and exam-execution week. The seven-mock campaign and
    final taper retain their intended dates.
    """

    opening = [
        {
            "focus": "Quantitative Methods I: returns, benchmarking, and time value",
            "topics": ["Quantitative Methods"],
            "sessions": WEEKS[0]["sessions"][:2],
            "questionTarget": 120,
            "masteryGate": "Explain each return type, benchmark choice, and time-value step, then clear 75% on a fresh foundation set.",
        },
        {
            "focus": "Quantitative Methods II: distributions, inference, portfolio risk, and simulation",
            "topics": ["Quantitative Methods"],
            "sessions": [WEEKS[0]["sessions"][2], *WEEKS[1]["sessions"][:2]],
            "questionTarget": 190,
            "masteryGate": "Complete two separated Quant sets at 75% or better with calculator steps and error causes fully reproducible.",
        },
        {
            "focus": "Quantitative Methods III and Economics I: data science, firms, cycles, policy, and geopolitics",
            "topics": ["Quantitative Methods", "Economics"],
            "sessions": [WEEKS[1]["sessions"][2], *WEEKS[2]["sessions"][:2]],
            "questionTarget": 190,
            "masteryGate": "Interpret the regression and data-science vocabulary, explain the policy-to-market chain, and clear 72% on fresh mixed questions.",
        },
        {
            "focus": "Economics II and Corporate Issuers: trade, currencies, governance, liquidity, and capital allocation",
            "topics": ["Economics", "Corporate Issuers"],
            "sessions": [WEEKS[2]["sessions"][2], *WEEKS[3]["sessions"]],
            "questionTarget": 220,
            "masteryGate": "Complete the exchange-rate process, produce a one-page corporate decision map, and clear 72% on fresh questions.",
        },
    ]

    alternatives_and_portfolio = {
        "focus": "Alternative Investments and Portfolio Management I: structures, returns, diversifiers, and portfolio risk",
        "topics": ["Alternative Investments", "Portfolio Management"],
        "sessions": [*WEEKS[14]["sessions"], WEEKS[15]["sessions"][0]],
        "questionTarget": 250,
        "masteryGate": "Clear fresh Alternative Investments and portfolio-risk sets, with every diversification and risk calculation explained from first principles.",
    }
    portfolio_and_ethics = {
        "focus": "Portfolio Management II and Ethics I: construction, behavior, trust, professionalism, and market integrity",
        "topics": ["Portfolio Management", "Ethical and Professional Standards"],
        "sessions": [WEEKS[15]["sessions"][1], *WEEKS[16]["sessions"]],
        "questionTarget": 270,
        "masteryGate": "Complete the portfolio decision map and apply the controlling ethical duty before selecting an answer on fresh cases.",
    }

    ethics_and_integration = {
        "focus": "Ethics II and integration I: duties, conflicts, candidate responsibilities, application, and decision maps",
        "topics": ["Ethical and Professional Standards", "Mixed Curriculum"],
        "sessions": [*WEEKS[17]["sessions"], WEEKS[18]["sessions"][0]],
        "questionTarget": 440,
        "masteryGate": "Clear the cumulative Ethics gate, explain every corrected answer, and complete the first integrated decision maps without adding new gaps.",
    }
    integration_and_gate = {
        "focus": "Full-curriculum switching, 102-module audit, and coverage gate",
        "topics": ["Mixed Curriculum"],
        "sessions": [WEEKS[18]["sessions"][1], *WEEKS[19]["sessions"]],
        "questionTarget": 440,
        "masteryGate": "Verify all 102 official modules, clear the mixed switching set, and convert every remaining weakness into a narrow active-repair item before Mock 1.",
    }

    return [
        *opening,
        *WEEKS[4:14],
        alternatives_and_portfolio,
        portfolio_and_ethics,
        ethics_and_integration,
        integration_and_gate,
        *WEEKS[20:],
    ]


def phase_for_week(week_number: int) -> str:
    if week_number <= 16:
        return "Phase 1 | Official 2027 Curriculum Coverage"
    if week_number == 17:
        return "Phase 1-2 Bridge | Coverage Close and Integration"
    if week_number == 18:
        return "Phase 2 | Integration and Coverage Gate"
    if week_number <= 26:
        return "Phase 3 | Mock and Repair Campaign"
    return "Phase 4 | Taper and Exam"


def build() -> tuple[list[dict], dict]:
    module_records: list[dict] = []
    title_to_id: dict[str, str] = {}
    global_number = 0
    for topic, entries in MODULES.items():
        for title, page in entries:
            global_number += 1
            reading_id = f"cfa-2027-outline-m{global_number:03d}"
            if title in title_to_id:
                raise ValueError(f"Duplicate official module title: {title}")
            title_to_id[title] = reading_id
            module_records.append(
                {
                    "id": reading_id,
                    "number": global_number,
                    "title": title,
                    "topic": topic,
                    "pageRange": f"Official outline p. {page}",
                    "authority": "official",
                    "curriculumStatus": "official",
                    "primaryEquivalent": None,
                    "notes": "Use the registered 2027 Learning Ecosystem lesson and current errata.",
                    "sessionNumbers": [],
                }
            )

    if len(module_records) != 102:
        raise ValueError(f"Expected 102 official modules, found {len(module_records)}")

    weeks: list[dict] = []
    session_number = 0
    first_week_start = date(2026, 8, 23)
    record_by_id = {record["id"]: record for record in module_records}
    mock_targets = {1: 60, 2: 63, 3: 65, 4: 67, 5: 69, 6: 70, 7: 72}

    blueprints = scheduled_weeks()
    if len(blueprints) != 27:
        raise ValueError(f"Expected 27 scheduled weeks, found {len(blueprints)}")

    for week_number, blueprint in enumerate(blueprints, start=1):
        week_start = first_week_start + timedelta(days=(week_number - 1) * 7)
        week_end = week_start + timedelta(days=6)
        assigned_titles = [
            title
            for session_blueprint in blueprint["sessions"]
            for title in session_blueprint["modules"]
        ]
        assigned_reading_ids = [title_to_id[title] for title in assigned_titles]

        independent_study = [
            (
                f"Study official 2027 Module {record_by_id[reading_id]['number']:03d}: "
                f"{record_by_id[reading_id]['title']} in the Learning Ecosystem, "
                "then write a concise recall note."
            )
            for reading_id in assigned_reading_ids
        ]
        if blueprint.get("mock"):
            independent_study.extend(
                [
                    "Complete the full mock independently under two-session exam conditions before Saturday's checkpoint.",
                    "Finish a first-pass mock debrief: classify every material miss and flag the three highest-value repair clusters.",
                ]
            )
        elif week_number == 27:
            independent_study.extend(
                [
                    "Complete only light retrieval from the frozen review list; do not reopen the curriculum.",
                    "Confirm identification, calculator, route, arrival time, food, sleep, and break logistics.",
                    "Execute the rehearsed exam-day routine on Saturday 27 February 2027.",
                ]
            )
        elif not assigned_reading_ids:
            independent_study.append(
                "Complete the assigned timed mixed assessment or repair set before Saturday's checkpoint."
            )
        if week_number < 27:
            independent_study.extend(
                [
                    f"Complete the week's {blueprint['questionTarget']}-question target and log each reviewed block in the tracker.",
                    "Classify every material miss, write one correction rule, and schedule delayed retrieval before the next checkpoint.",
                ]
            )

        week: dict = {
            "phase": phase_for_week(week_number),
            "week": week_number,
            "startDate": week_start.isoformat(),
            "endDate": week_end.isoformat(),
            "focus": blueprint["focus"],
            "topics": blueprint["topics"],
            "outcomes": [
                blueprint["masteryGate"],
                "Keep the tracker, error log, and delayed-retest queue current.",
            ],
            "independentStudy": independent_study,
            "questionTarget": blueprint["questionTarget"],
            "masteryGate": blueprint["masteryGate"],
            "mockMilestone": {
                "label": (
                    f"Mock {blueprint['mock']}"
                    if blueprint.get("mock")
                    else "Exam execution gate"
                    if week_number == 27
                    else "Weekly evidence gate"
                ),
                "targetScore": mock_targets.get(blueprint.get("mock")),
                "instruction": (
                    "Complete the full mock independently under two-session exam conditions before Saturday's checkpoint."
                    if blueprint.get("mock")
                    else blueprint["masteryGate"]
                ),
            },
        }

        # The first 26 weeks end with one fixed Saturday checkpoint. Week 27 is
        # reserved for independent taper and the Saturday exam appointment, so
        # no tutoring session is placed on exam day.
        if week_number <= 26:
            session_number += 1
            for reading_id in assigned_reading_ids:
                record_by_id[reading_id]["sessionNumbers"].append(session_number)
            checkpoint_kind = (
                "Prior-attempt diagnostic + Quant M001-M004 checkpoint"
                if week_number == 1
                else f"Mock {blueprint['mock']} checkpoint and forensic repair"
                if blueprint.get("mock")
                else f"Weekly checkpoint: {blueprint['focus']}"
            )
            checkpoint_objective = (
                "Establish the baseline from both prior attempts, test Quant Modules M001-M004, reteach the highest-value gaps, and issue the next independent-study assignment."
                if week_number == 1
                else "Audit the independent full-mock evidence, reteach the highest-value error clusters, verify transfer on fresh questions, and issue the next repair assignment."
                if blueprint.get("mock")
                else "Test the assigned work, reteach the highest-value gaps, verify the mastery gate on fresh questions, and issue the next independent-study assignment."
            )
            week["session1"] = {
                "label": "Saturday 09:00 checkpoint",
                "title": checkpoint_kind,
                "objective": checkpoint_objective,
                "durationMinutes": 120,
                "number": session_number,
                "requirement": "required",
                "date": week_end.isoformat(),
                "day": "Saturday",
                "readings": assigned_reading_ids,
            }
        weeks.append(week)

    if session_number != 26:
        raise ValueError(f"Expected 26 tutoring checkpoints, found {session_number}")
    missing = [record["id"] for record in module_records if not record["sessionNumbers"]]
    if missing:
        raise ValueError(f"Unassigned official modules: {missing}")

    catalog = {
        "catalogId": "project-202-official-2027-v1",
        "pageRangeBasis": "Page numbers refer to the official 31-page 2027 Level I Topic Outlines PDF.",
        "sources": [
            {
                "id": "cfa-2027-outline",
                "fileName": "2027levelitopicoutline_online.pdf",
                "title": "CFA Institute 2027 Level I Topic Outlines",
                "editionYear": 2027,
                "publishedYear": 2026,
                "authority": "official",
                "url": OUTLINE_URL,
            }
        ],
        "coverageNotes": [
            "All 102 publicly listed 2027 Level I learning modules are assigned for independent study in official topic order and mapped to Weekly Checkpoints 01-17.",
            "The candidate's registered 2027 Learning Ecosystem supplies the full lessons, examples, practice questions, and interactive tools.",
            "The Learning Ecosystem and current CFA Institute errata remain authoritative if any wording or curriculum detail changes.",
            f"Check current errata regularly: {ERRATA_URL}",
        ],
        "readings": module_records,
    }
    return weeks, catalog


def main() -> None:
    weeks, catalog = build()
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    (DATA_DIR / "plan.json").write_text(
        json.dumps(weeks, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    (DATA_DIR / "readings.json").write_text(
        json.dumps(catalog, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(
        json.dumps(
            {
                "weeks": len(weeks),
                "sessions": sum(
                    1
                    for week in weeks
                    for key in ("session1", "session2", "session3")
                    if key in week
                ),
                "officialModules": len(catalog["readings"]),
                "coverageSessionRange": "S01-S17",
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
