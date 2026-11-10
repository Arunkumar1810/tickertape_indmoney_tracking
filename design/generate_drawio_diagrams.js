/**
 * generate_drawio_diagrams.js
 * Generates comprehensive, professional Draw.io diagrams (.drawio XML) for the
 * entire tickertape-indmoney-tracking repository:
 *   1. Activity Diagram (Workflow & data pipeline across Tiers 1-4)
 *   2. Component & Class Diagram (Architecture packages, modules & data contracts)
 *   3. Use Case Diagram (Actors, subsystems, use cases, include/extend)
 *   4. Sequence Diagram (Time-ordered multi-tier strategy orchestration flow)
 *   5. Master Architecture Workbook (All 4 diagrams in a multi-page .drawio file)
 */

'use strict';

const fs = require('fs');
const path = require('path');

const DESIGN_DIR = __dirname;

function escapeXml(unsafe) {
  if (unsafe === undefined || unsafe === null) return '';
  return String(unsafe)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

class DiagramBuilder {
  constructor(id, name, width = 2400, height = 1800) {
    this.id = id;
    this.name = name;
    this.width = width;
    this.height = height;
    this.cells = [];
    this.nextId = 100;
  }

  genId(prefix = 'cell') {
    return `${prefix}_${this.nextId++}`;
  }

  addVertex(id, value, style, x, y, width, height, parent = '1') {
    this.cells.push({
      id,
      value: escapeXml(value),
      style,
      x: Math.round(x),
      y: Math.round(y),
      width: Math.round(width),
      height: Math.round(height),
      parent,
      vertex: 1
    });
    return id;
  }

  addEdge(id, value, style, source, target, parent = '1', points = null) {
    this.cells.push({
      id,
      value: escapeXml(value),
      style,
      source,
      target,
      parent,
      points,
      edge: 1
    });
    return id;
  }

  toXmlDiagram() {
    let xml = `  <diagram id="${this.id}" name="${escapeXml(this.name)}">\n`;
    xml += `    <mxGraphModel dx="1600" dy="1000" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="${this.width}" pageHeight="${this.height}" math="0" shadow="0">\n`;
    xml += `      <root>\n`;
    xml += `        <mxCell id="0" />\n`;
    xml += `        <mxCell id="1" parent="0" />\n`;

    for (const cell of this.cells) {
      if (cell.vertex) {
        xml += `        <mxCell id="${cell.id}" value="${cell.value}" style="${cell.style}" vertex="1" parent="${cell.parent}">\n`;
        xml += `          <mxGeometry x="${cell.x}" y="${cell.y}" width="${cell.width}" height="${cell.height}" as="geometry" />\n`;
        xml += `        </mxCell>\n`;
      } else if (cell.edge) {
        xml += `        <mxCell id="${cell.id}" value="${cell.value}" style="${cell.style}" edge="1" parent="${cell.parent}" source="${cell.source}" target="${cell.target}">\n`;
        xml += `          <mxGeometry relative="1" as="geometry">\n`;
        if (cell.points && cell.points.length > 0) {
          xml += `            <Array as="points">\n`;
          for (const pt of cell.points) {
            xml += `              <mxPoint x="${pt.x}" y="${pt.y}" />\n`;
          }
          xml += `            </Array>\n`;
        }
        xml += `          </mxGeometry>\n`;
        xml += `        </mxCell>\n`;
      }
    }

    xml += `      </root>\n`;
    xml += `    </mxGraphModel>\n`;
    xml += `  </diagram>\n`;
    return xml;
  }
}

function wrapMxFile(diagramXmls) {
  return `<mxfile host="Electron" modified="${new Date().toISOString()}" agent="Antigravity Architecture Engine" version="21.0.0" type="device">\n${diagramXmls.join('')}</mxfile>\n`;
}

// ==============================================================================
// 1. ACTIVITY DIAGRAM GENERATOR
// ==============================================================================
function buildActivityDiagram() {
  const d = new DiagramBuilder('activity_diag', 'End-to-End Activity Workflow', 2600, 2000);

  // Swimlanes:
  const swimlanes = [
    { id: 'lane_user', title: 'Investor / CLI Interface', x: 40, width: 280, color: '#334155' },
    { id: 'lane_tier1', title: 'Tier 1: Auth & API Client Layer', x: 320, width: 340, color: '#0F766E' },
    { id: 'lane_tier2', title: 'Tier 2: Ingestion & Normalization', x: 660, width: 380, color: '#0369A1' },
    { id: 'lane_tier3', title: 'Tier 3: Gatekeeper & Valuation Engines', x: 1040, width: 440, color: '#6D28D9' },
    { id: 'lane_tier4', title: 'Tier 4: Strategy Orchestrator & Synthesis', x: 1480, width: 440, color: '#047857' },
    { id: 'lane_frame', title: 'Framework: Validation & Artifact Harness', x: 1920, width: 360, color: '#475569' }
  ];

  const laneHeight = 1880;
  for (const lane of swimlanes) {
    const style = `swimlane;html=1;startSize=40;fillColor=#F8FAFC;swimlaneFillColor=#FFFFFF;strokeColor=${lane.color};strokeWidth=2;fontFamily=Segoe UI;fontSize=14;fontStyle=1;fontColor=#FFFFFF;swimlaneLine=1;swimlaneHead=0;swimlaneHorizontal=1;gradientColor=${lane.color};gradientDirection=south;`;
    d.addVertex(lane.id, lane.title, style, lane.x, 60, lane.width, laneHeight);
  }

  // Common node styles
  const startStyle = 'ellipse;html=1;shape=ellipse;fillColor=#0F172A;strokeColor=#0F172A;strokeWidth=2;';
  const endStyle = 'ellipse;html=1;shape=doubleEllipse;fillColor=#0F172A;strokeColor=#059669;strokeWidth=3;';
  const actionStyle = (bg, border, text = '#0F172A') =>
    `rounded=1;whiteSpace=wrap;html=1;fillColor=${bg};strokeColor=${border};strokeWidth=2;fontFamily=Segoe UI;fontSize=12;fontColor=${text};fontStyle=1;arcSize=15;shadow=1;`;
  const decisionStyle =
    'rhombus;whiteSpace=wrap;html=1;fillColor=#FEF08A;strokeColor=#CA8A04;strokeWidth=2;fontFamily=Segoe UI;fontSize=11;fontStyle=1;fontColor=#854D0E;shadow=1;';
  const forkStyle = 'html=1;shape=rect;fillColor=#1E293B;strokeColor=#1E293B;strokeWidth=1;';
  const objectStyle =
    'shape=note;whiteSpace=wrap;html=1;backgroundOutline=1;size=14;fillColor=#F1F5F9;strokeColor=#64748B;strokeWidth=1.5;fontFamily=Segoe UI;fontSize=11;fontColor=#334155;fontStyle=2;shadow=1;';
  const edgeStyle = 'edgeStyle=orthogonalEdgeStyle;rounded=1;orthogonalLoop=1;jettySize=auto;html=1;strokeColor=#475569;strokeWidth=2;fontFamily=Segoe UI;fontSize=11;fontColor=#1E293B;';
  const edgeAlertStyle = 'edgeStyle=orthogonalEdgeStyle;rounded=1;orthogonalLoop=1;jettySize=auto;html=1;strokeColor=#E11D48;strokeWidth=2.5;fontFamily=Segoe UI;fontSize=11;fontColor=#BE123C;dashed=1;';

  // 1. User Lane
  d.addVertex('act_start', '', startStyle, 160, 120, 30, 30);
  d.addVertex(
    'act_cmd',
    'Run CLI Orchestrator\nnode way_long_term_strategy.js\n--way fundamental_lts',
    actionStyle('#E2E8F0', '#64748B'),
    75, 180, 200, 60
  );
  d.addEdge('e_start_cmd', '', edgeStyle, 'act_start', 'act_cmd');

  // 2. Framework Lane: Validate Manifest
  d.addVertex(
    'act_load_manifest',
    'Load investment_ways.yaml\n& Run manifest_validator.js',
    actionStyle('#F1F5F9', '#475569'),
    1990, 180, 220, 60
  );
  d.addEdge('e_cmd_manifest', 'Load Config', edgeStyle, 'act_cmd', 'act_load_manifest');

  d.addVertex(
    'dec_manifest_valid',
    'Manifest\nValid?',
    decisionStyle,
    2050, 270, 100, 60
  );
  d.addEdge('e_val_manifest', '', edgeStyle, 'act_load_manifest', 'dec_manifest_valid');

  d.addVertex(
    'act_abort_manifest',
    'Throw ERR_INVALID_MANIFEST\n& Halt Execution',
    actionStyle('#FFE4E6', '#E11D48', '#9F1239'),
    2000, 360, 200, 50
  );
  d.addEdge('e_man_fail', '[No: Schema Error]', edgeAlertStyle, 'dec_manifest_valid', 'act_abort_manifest');

  // Fork into Data Ingestion (Tier 1 & Tier 2)
  d.addVertex('fork_ingestion', '', forkStyle, 100, 430, 900, 8);
  d.addEdge('e_man_pass', '[Yes: Manifest OK]', edgeStyle, 'dec_manifest_valid', 'fork_ingestion', '1', [
    { x: 2190, y: 300 },
    { x: 2190, y: 410 },
    { x: 550, y: 410 }
  ]);

  // Branch A: Angel One
  d.addVertex(
    'act_auth_angel',
    'Tier 1 Auth:\nSmartAPI TOTP + JWT Session\n(Renew if expired)',
    actionStyle('#CCFBF1', '#0D9488', '#115E59'),
    380, 470, 220, 60
  );
  d.addEdge('e_fork_angel', 'Fetch IN Demat', edgeStyle, 'fork_ingestion', 'act_auth_angel');

  d.addVertex(
    'act_fetch_angel',
    'Tier 2 Fetch Demat Positions\n& Ledger Cash Balances\n(fetch_angelone.js)',
    actionStyle('#E0F2FE', '#0284C7', '#0369A1'),
    720, 470, 240, 60
  );
  d.addEdge('e_auth_fetch_angel', 'API Session', edgeStyle, 'act_auth_angel', 'act_fetch_angel');

  d.addVertex(
    'obj_angel_snapshot',
    '«DataContract»\nAccountHoldingsSnapshot\n(angelone.json)',
    objectStyle,
    750, 555, 180, 50
  );
  d.addEdge('e_angel_obj', 'Emits', edgeStyle, 'act_fetch_angel', 'obj_angel_snapshot');

  // Branch B: INDmoney US
  d.addVertex(
    'act_auth_indmoney',
    'Tier 1 Auth:\nINDmoney / DriveWealth\nOAuth2 Refresh Token Flow',
    actionStyle('#CCFBF1', '#0D9488', '#115E59'),
    380, 640, 220, 60
  );
  d.addEdge('e_fork_ind', 'Fetch US Equities', edgeStyle, 'fork_ingestion', 'act_auth_indmoney', '1', [
    { x: 250, y: 438 },
    { x: 250, y: 670 },
    { x: 380, y: 670 }
  ]);

  d.addVertex(
    'act_fetch_indmoney',
    'Tier 2 Fetch US Holdings,\nUSD Cash & Live USD/INR FX\n(fetch_indmoney_us.js)',
    actionStyle('#E0F2FE', '#0284C7', '#0369A1'),
    720, 640, 240, 60
  );
  d.addEdge('e_auth_fetch_ind', 'OAuth Token', edgeStyle, 'act_auth_indmoney', 'act_fetch_indmoney');

  d.addVertex(
    'obj_ind_snapshot',
    '«DataContract»\nAccountHoldingsSnapshot\n(indmoney_us.json)',
    objectStyle,
    750, 725, 180, 50
  );
  d.addEdge('e_ind_obj', 'Emits', edgeStyle, 'act_fetch_indmoney', 'obj_ind_snapshot');

  // Branch C: Tickertape Market Fundamentals Provider
  d.addVertex(
    'act_auth_tt',
    'Tier 1 Auth:\nTickertape Pro Auth Client\n(Session validation)',
    actionStyle('#CCFBF1', '#0D9488', '#115E59'),
    380, 810, 220, 60
  );
  d.addEdge('e_fork_tt', 'Fetch Financials', edgeStyle, 'fork_ingestion', 'act_auth_tt', '1', [
    { x: 180, y: 438 },
    { x: 180, y: 840 },
    { x: 380, y: 840 }
  ]);

  d.addVertex(
    'act_fetch_tt',
    'Tier 2 Ingest & Normalize\nFinancial Statements & Ratios\n(provider_tickertape.js)',
    actionStyle('#E0F2FE', '#0284C7', '#0369A1'),
    720, 810, 240, 60
  );
  d.addEdge('e_auth_fetch_tt', 'Session Token', edgeStyle, 'act_auth_tt', 'act_fetch_tt');

  d.addVertex(
    'obj_norm_financials',
    '«DataContract»\nNormalizedCompanyFinancials\n(financials/<TICKER>.json)',
    objectStyle,
    740, 895, 200, 50
  );
  d.addEdge('e_tt_obj', 'Normalizes', edgeStyle, 'act_fetch_tt', 'obj_norm_financials');

  // Join Data Ingestion
  d.addVertex('join_ingestion', '', forkStyle, 700, 975, 400, 8);
  d.addEdge('e_join_a', '', edgeStyle, 'obj_angel_snapshot', 'join_ingestion');
  d.addEdge('e_join_b', '', edgeStyle, 'obj_ind_snapshot', 'join_ingestion');
  d.addEdge('e_join_c', '', edgeStyle, 'obj_norm_financials', 'join_ingestion');

  // Tier 4 Stage 2: Multi-Account Holding Blender
  d.addVertex(
    'act_holding_blender',
    'Stage 2: Multi-Account Holding Blender\nConsolidate Domestic + Foreign Holdings\nCompute WAC, Pool Cash at FX, Preserve Lots',
    actionStyle('#D1FAE5', '#059669', '#065F46'),
    1540, 950, 320, 65
  );
  d.addEdge('e_join_blender', 'Snapshots & FX', edgeStyle, 'join_ingestion', 'act_holding_blender');

  d.addVertex(
    'obj_blended_holdings',
    '«DataContract»\nStrategyHoldingsBlended\n(holdings_blended.json)',
    objectStyle,
    1600, 1040, 200, 50
  );
  d.addEdge('e_blend_obj', 'Produces', edgeStyle, 'act_holding_blender', 'obj_blended_holdings');

  // Tier 4 Stage 3: Strategy XIRR & Friction Tracker
  d.addVertex(
    'act_strategy_xirr',
    'Stage 3: True Strategy XIRR & Friction\nPool External Cashflows, Cancel Transfers,\nSolve Newton-Raphson XIRR, Audit STT/Brokerage',
    actionStyle('#D1FAE5', '#059669', '#065F46'),
    1540, 1115, 320, 65
  );
  d.addEdge('e_blend_xirr', 'Blended Ledger', edgeStyle, 'obj_blended_holdings', 'act_strategy_xirr');

  d.addVertex(
    'obj_strategy_xirr',
    '«DataContract»\nStrategyXirrReport\n(strategy_xirr.json)',
    objectStyle,
    1600, 1205, 200, 50
  );
  d.addEdge('e_xirr_obj', 'Produces', edgeStyle, 'act_strategy_xirr', 'obj_strategy_xirr');

  // Tier 3 Stage 4A: Forensic Governance Gatekeeper Filter
  d.addVertex(
    'act_forensic_gov',
    'Forensic Governance Gatekeeper\nPromoter Pledging, Auditor Continuity,\nBeneish M-Score, Sloan Accrual Ratio',
    actionStyle('#FFE4E6', '#E11D48', '#9F1239'),
    1100, 1115, 300, 65
  );
  d.addEdge('e_norm_to_forensic', 'Audited Statements', edgeStyle, 'obj_norm_financials', 'act_forensic_gov', '1', [
    { x: 990, y: 920 },
    { x: 990, y: 1145 },
    { x: 1100, y: 1145 }
  ]);

  d.addVertex(
    'dec_gatekeeper_veto',
    'Gatekeeper\nVETO?',
    decisionStyle,
    1200, 1205, 100, 60
  );
  d.addEdge('e_fg_dec', '', edgeStyle, 'act_forensic_gov', 'dec_gatekeeper_veto');

  // Short-Circuit Branch
  d.addVertex(
    'act_short_circuit',
    'GATEKEEPER SHORT-CIRCUIT:\n• Veto Security Immediately\n• Force Capital Allocation = 0.0%\n• Flag as DISQUALIFIED in Banner',
    actionStyle('#FFE4E6', '#E11D48', '#9F1239'),
    1080, 1290, 340, 65
  );
  d.addEdge('e_veto_yes', '[Yes: Accounting Red Flag]', edgeAlertStyle, 'dec_gatekeeper_veto', 'act_short_circuit');

  // Parallel Valuation Principles (If Not Vetoed)
  d.addVertex('fork_valuation', '', forkStyle, 1080, 1375, 340, 8);
  d.addEdge('e_veto_no', '[No: PASS / FLAG]', edgeStyle, 'dec_gatekeeper_veto', 'fork_valuation', '1', [
    { x: 1300, y: 1235 },
    { x: 1440, y: 1235 },
    { x: 1440, y: 1360 },
    { x: 1250, y: 1360 }
  ]);

  d.addVertex(
    'act_val_graham',
    'Benjamin Graham Valuation:\nNCAV, NNWC, Graham Number,\nMargin of Safety Floor',
    actionStyle('#EDE9FE', '#7C3AED', '#5B21B6'),
    1060, 1400, 180, 60
  );
  d.addVertex(
    'act_val_lynch',
    'Peter Lynch GARP Valuation:\nPEG, Yield-Adjusted PEG,\nInventory Velocity, Archetype',
    actionStyle('#EDE9FE', '#7C3AED', '#5B21B6'),
    1260, 1400, 180, 60
  );
  d.addVertex(
    'act_val_buffett',
    'Buffett & Munger Moat:\nOwner Earnings (CFO-CapEx-SBC),\n5-Step DuPont ROE, ROIC Moat',
    actionStyle('#EDE9FE', '#7C3AED', '#5B21B6'),
    1060, 1480, 180, 60
  );
  d.addVertex(
    'act_val_klarman',
    'Seth Klarman Solvency:\nAltman Z-Score, Net Debt/EBITDA,\n24M Debt Maturity Wall Stress',
    actionStyle('#EDE9FE', '#7C3AED', '#5B21B6'),
    1260, 1480, 180, 60
  );

  d.addEdge('e_fv_graham', '', edgeStyle, 'fork_valuation', 'act_val_graham');
  d.addEdge('e_fv_lynch', '', edgeStyle, 'fork_valuation', 'act_val_lynch');
  d.addEdge('e_fv_buffett', '', edgeStyle, 'fork_valuation', 'act_val_buffett');
  d.addEdge('e_fv_klarman', '', edgeStyle, 'fork_valuation', 'act_val_klarman');

  // Join Valuation Principles
  d.addVertex('join_valuation', '', forkStyle, 1080, 1560, 340, 8);
  d.addEdge('e_jv_graham', '', edgeStyle, 'act_val_graham', 'join_valuation');
  d.addEdge('e_jv_lynch', '', edgeStyle, 'act_val_lynch', 'join_valuation');
  d.addEdge('e_jv_buffett', '', edgeStyle, 'act_val_buffett', 'join_valuation');
  d.addEdge('e_jv_klarman', '', edgeStyle, 'act_val_klarman', 'join_valuation');

  // Tier 4 Stage 4B: Guardrail Engine & Stance Synthesis
  d.addVertex(
    'act_guardrail_engine',
    'Stage 4: Asymmetric Downside Guardrail\n& Stance Synthesis (guardrail-engine)\n• If ANY Principle == STRONG_SELL -> NEEDS_REVIEW\n• If Gatekeeper == FLAG -> Cap Ceiling at HOLD\n• Compute Weighted Composite Stance Score',
    actionStyle('#D1FAE5', '#059669', '#065F46'),
    1520, 1420, 360, 80
  );
  d.addEdge('e_val_to_guardrail', 'Uniform Verdicts', edgeStyle, 'join_valuation', 'act_guardrail_engine');
  d.addEdge('e_short_to_guardrail', 'Disqualified Verdict', edgeAlertStyle, 'act_short_circuit', 'act_guardrail_engine', '1', [
    { x: 1460, y: 1320 },
    { x: 1700, y: 1320 }
  ]);

  d.addVertex(
    'obj_verdict_synthesis',
    '«DataContract»\nStrategyVerdictSynthesis\n(strategy_verdict_synthesis.json)',
    objectStyle,
    1600, 1530, 200, 50
  );
  d.addEdge('e_synth_obj', 'Produces', edgeStyle, 'act_guardrail_engine', 'obj_verdict_synthesis');

  // Stage 5: Option C Consolidated Master Portfolio Assembly
  d.addVertex(
    'act_stage5_assembly',
    'Stage 5: Option C Master Compilation\ncompileConsolidatedPortfolio()\n& compileEmbeddedAudits()',
    actionStyle('#D1FAE5', '#059669', '#065F46'),
    1540, 1610, 320, 65
  );
  d.addEdge('e_xirr_to_s5', 'Performance KPIs', edgeStyle, 'obj_strategy_xirr', 'act_stage5_assembly', '1', [
    { x: 1840, y: 1230 },
    { x: 1840, y: 1640 }
  ]);
  d.addEdge('e_synth_to_s5', 'Synthesized Stances', edgeStyle, 'obj_verdict_synthesis', 'act_stage5_assembly');

  // Framework Validation of Final Artifacts
  d.addVertex(
    'act_contract_val',
    'Contract Validation:\nvalidateConsolidatedPortfolio()\nCheck Top-Level Schema Keys',
    actionStyle('#F1F5F9', '#475569'),
    1990, 1610, 220, 65
  );
  d.addEdge('e_s5_to_val', 'Master Contract', edgeStyle, 'act_stage5_assembly', 'act_contract_val');

  d.addVertex(
    'act_artifact_harness',
    'Artifact Harness Audit:\nartifact_harness.js\nVerify 100% Offline Self-Containment\n(Zero CDN scripts, external fonts, leaks)',
    actionStyle('#F1F5F9', '#475569'),
    1990, 1705, 220, 70
  );
  d.addEdge('e_val_to_harness', 'HTML Dashboard', edgeStyle, 'act_contract_val', 'act_artifact_harness');

  // User Lane Delivery
  d.addVertex(
    'act_render_output',
    'Deliver Twin Master Artifacts:\n• way_long_term_strategy.json\n• way_long_term_strategy.html\nRender interactive tabs & KPI hero',
    actionStyle('#FEF3C7', '#D97706', '#92400E'),
    65, 1705, 230, 70
  );
  d.addEdge('e_harness_to_user', 'Emit Artifacts', edgeStyle, 'act_artifact_harness', 'act_render_output', '1', [
    { x: 2100, y: 1810 },
    { x: 180, y: 1810 }
  ]);

  d.addVertex('act_end', '', endStyle, 165, 1815, 30, 30);
  d.addEdge('e_out_end', '', edgeStyle, 'act_render_output', 'act_end');

  return d;
}

// ==============================================================================
// 2. COMPONENT & CLASS DIAGRAM GENERATOR
// ==============================================================================
function buildComponentClassDiagram() {
  const d = new DiagramBuilder('comp_class_diag', 'Component & Class Architecture Diagram', 2800, 2200);

  // Styling
  const pkgStyle = (border, headerBg) =>
    `shape=folder;fontStyle=1;tabWidth=160;tabHeight=32;tabPosition=left;html=1;boundedLbl=1;fillColor=#F8FAFC;strokeColor=${border};strokeWidth=2;fontFamily=Segoe UI;fontSize=13;fontColor=#0F172A;shadow=1;`;
  const classStyle = (headerBg, border) =>
    `swimlane;fontStyle=1;align=center;verticalAlign=top;childLayout=stackLayout;horizontal=1;startSize=30;horizontalStack=0;resizeParent=1;resizeParentMax=0;resizeLast=0;collapsible=1;marginBottom=0;html=1;fillColor=#FFFFFF;swimlaneFillColor=#FFFFFF;strokeColor=${border};strokeWidth=1.5;fontFamily=Segoe UI;fontSize=12;fontColor=#0F172A;gradientColor=${headerBg};gradientDirection=south;shadow=1;`;
  const itemStyle =
    'text;html=1;strokeColor=none;fillColor=none;align=left;verticalAlign=middle;spacingLeft=8;spacingRight=4;overflow=hidden;rotatable=0;points=[[0,0.5],[1,0.5]];portConstraint=eastwest;fontFamily=Consolas, Courier New;fontSize=11;fontColor=#334155;';
  const dividerStyle =
    'line;strokeWidth=1;fillColor=none;align=left;verticalAlign=middle;spacingTop=-1;spacingBottom=-1;points=[];portConstraint=eastwest;strokeColor=#CBD5E1;';
  const depEdgeStyle = 'edgeStyle=orthogonalEdgeStyle;rounded=1;orthogonalLoop=1;jettySize=auto;html=1;strokeColor=#64748B;strokeWidth=1.5;dashed=1;fontFamily=Segoe UI;fontSize=11;fontColor=#334155;endArrow=open;endSize=8;';
  const compEdgeStyle = 'edgeStyle=orthogonalEdgeStyle;rounded=1;orthogonalLoop=1;jettySize=auto;html=1;strokeColor=#0F172A;strokeWidth=1.5;fontFamily=Segoe UI;fontSize=11;fontColor=#0F172A;startArrow=diamond;startFill=1;startSize=10;endArrow=none;';
  const assocEdgeStyle = 'edgeStyle=orthogonalEdgeStyle;rounded=1;orthogonalLoop=1;jettySize=auto;html=1;strokeColor=#334155;strokeWidth=1.5;fontFamily=Segoe UI;fontSize=11;fontColor=#1E293B;endArrow=block;endFill=1;';

  // PACKAGE 1: Tier 1 - External Authentication & API Clients
  d.addVertex('pkg_tier1', 'Tier 1: External Authentication & API Clients\n(scripts/angelone, scripts/indmoney, scripts/tickertape, scripts/framework)', pkgStyle('#0D9488'), 40, 40, 840, 480);

  // Class: AuthManager
  const cAuthMgr = d.addVertex('cls_auth_mgr', 'AuthManager\n«Singleton / Service»', classStyle('#CCFBF1', '#0D9488'), 70, 95, 230, 170, 'pkg_tier1');
  d.addVertex('f_am_1', '+ getCredentials(serviceId): object\n+ refreshOAuthToken(serviceId): Promise&lt;token&gt;\n+ decryptSecret(enc): string', itemStyle, 0, 30, 230, 55, cAuthMgr);
  d.addVertex('f_am_div', '', dividerStyle, 0, 85, 230, 5, cAuthMgr);
  d.addVertex('f_am_2', '+ renewExpiredTokens(): Promise&lt;boolean&gt;\n+ saveTokens(serviceId, tokens): void\n+ auditAuthStatus(): AuthReport', itemStyle, 0, 90, 230, 65, cAuthMgr);

  // Class: AngelOneClient
  const cAngelClient = d.addVertex('cls_angel_client', 'AngelOneClient\n«SmartAPI Adapter»', classStyle('#CCFBF1', '#0D9488'), 330, 95, 240, 170, 'pkg_tier1');
  d.addVertex('f_ac_1', '- clientCode: string\n- apiKey: string\n- jwtToken: string\n- feedToken: string', itemStyle, 0, 30, 240, 55, cAngelClient);
  d.addVertex('f_ac_div', '', dividerStyle, 0, 85, 240, 5, cAngelClient);
  d.addVertex('f_ac_2', '+ loginWithTotp(totpPin): Promise&lt;Session&gt;\n+ getHoldings(): Promise&lt;RawHoldings&gt;\n+ getRMSLimits(): Promise&lt;CashBalance&gt;', itemStyle, 0, 90, 240, 65, cAngelClient);

  // Class: IndmoneyClient
  const cIndClient = d.addVertex('cls_ind_client', 'IndmoneyClient\n«DriveWealth Adapter»', classStyle('#CCFBF1', '#0D9488'), 600, 95, 250, 170, 'pkg_tier1');
  d.addVertex('f_ic_1', '- accessToken: string\n- refreshToken: string\n- driveWealthAccountId: string', itemStyle, 0, 30, 250, 55, cIndClient);
  d.addVertex('f_ic_div', '', dividerStyle, 0, 85, 250, 5, cIndClient);
  d.addVertex('f_ic_2', '+ getUsHoldings(): Promise&lt;DwHoldings&gt;\n+ getUsCashBalance(): Promise&lt;DwCash&gt;\n+ getLiveUsdInrFxRate(): Promise&lt;number&gt;', itemStyle, 0, 90, 250, 65, cIndClient);

  // Class: TickertapeClient
  const cTtClient = d.addVertex('cls_tt_client', 'TickertapeClient\n«Tickertape Pro Adapter»', classStyle('#CCFBF1', '#0D9488'), 330, 290, 260, 200, 'pkg_tier1');
  d.addVertex('f_tc_1', '- sessionToken: string\n- clientCredentials: object\n- cacheDir: string', itemStyle, 0, 30, 260, 55, cTtClient);
  d.addVertex('f_tc_div', '', dividerStyle, 0, 85, 260, 5, cTtClient);
  d.addVertex('f_tc_2', '+ fetchQuotes(ticker, market): Promise&lt;Quote&gt;\n+ fetchFinancials(ticker, stmtType): Promise&lt;Stmt&gt;\n+ fetchHoldingsAndForensics(ticker): Promise&lt;Data&gt;\n+ fetchHistoricalRatios(ticker): Promise&lt;Ratios&gt;', itemStyle, 0, 90, 260, 95, cTtClient);

  // PACKAGE 2: Tier 2 - Ingestion & Normalization Providers
  d.addVertex('pkg_tier2', 'Tier 2: Holdings & Market Data Providers\n(skills/fetch-angelone, skills/fetch-indmoney-us, skills/provider-tickertape)', pkgStyle('#0284C7'), 920, 40, 880, 480);

  // Class: FetchAngeloneService
  const cFetchAngel = d.addVertex('cls_fetch_angel', 'FetchAngelOneService\n«Provider Skill»', classStyle('#E0F2FE', '#0284C7'), 950, 95, 250, 180, 'pkg_tier2');
  d.addVertex('f_fa_1', '- client: AngelOneClient\n- cache: FileCache', itemStyle, 0, 30, 250, 40, cFetchAngel);
  d.addVertex('f_fa_div', '', dividerStyle, 0, 70, 250, 5, cFetchAngel);
  d.addVertex('f_fa_2', '+ fetchHoldings(options): Promise&lt;Snapshot&gt;\n+ normalizePositions(raw): HoldingLot[]\n+ renderOfflineHtml(snapshot): string\n+ emitArtifacts(dir): void', itemStyle, 0, 75, 250, 90, cFetchAngel);

  // Class: FetchIndmoneyUsService
  const cFetchInd = d.addVertex('cls_fetch_ind', 'FetchIndmoneyUsService\n«Provider Skill»', classStyle('#E0F2FE', '#0284C7'), 1230, 95, 260, 180, 'pkg_tier2');
  d.addVertex('f_fi_1', '- client: IndmoneyClient\n- cache: FileCache', itemStyle, 0, 30, 260, 40, cFetchInd);
  d.addVertex('f_fi_div', '', dividerStyle, 0, 70, 260, 5, cFetchInd);
  d.addVertex('f_fi_2', '+ fetchHoldings(options): Promise&lt;Snapshot&gt;\n+ normalizeUsEquities(raw): HoldingLot[]\n+ convertCashToInr(usdCash, fx): number\n+ renderOfflineHtml(snapshot): string', itemStyle, 0, 75, 260, 90, cFetchInd);

  // Class: ProviderTickertapeService
  const cProvTt = d.addVertex('cls_prov_tt', 'ProviderTickertapeService\n«Market Data Provider»', classStyle('#E0F2FE', '#0284C7'), 1520, 95, 260, 190, 'pkg_tier2');
  d.addVertex('f_pt_1', '- client: TickertapeClient\n- validator: ContractValidator\n- cacheTtlHours: number = 24', itemStyle, 0, 30, 260, 50, cProvTt);
  d.addVertex('f_pt_div', '', dividerStyle, 0, 80, 260, 5, cProvTt);
  d.addVertex('f_pt_2', '+ ingestCompany(ticker, market): Promise&lt;NCF&gt;\n+ mapFinancialStatements(raw): NormalizedCompany\n+ checkCacheFreshness(ticker): boolean\n+ renderFinancialsHtml(ncf): string', itemStyle, 0, 85, 260, 90, cProvTt);

  // Contract: AccountHoldingsSnapshot
  const cSnapContract = d.addVertex('cls_snap_contract', 'AccountHoldingsSnapshot\n«DataContract JSON Schema»', classStyle('#F1F5F9', '#64748B'), 1070, 310, 280, 180, 'pkg_tier2');
  d.addVertex('f_sc_1', '+ account_id: string\n+ broker: "angelone" | "indmoney"\n+ currency: "INR" | "USD"\n+ holdings: HoldingLot[]\n+ cash_balances: CashBalance\n+ summary: AccountSummary', itemStyle, 0, 30, 280, 90, cSnapContract);
  d.addVertex('f_sc_div', '', dividerStyle, 0, 120, 280, 5, cSnapContract);
  d.addVertex('f_sc_2', '+ validate(): boolean\n+ toJSON(): string', itemStyle, 0, 125, 280, 45, cSnapContract);

  // Contract: NormalizedCompanyFinancials
  const cNcfContract = d.addVertex('cls_ncf_contract', 'NormalizedCompanyFinancials\n«DataContract JSON Schema»', classStyle('#F1F5F9', '#64748B'), 1470, 310, 300, 195, 'pkg_tier2');
  d.addVertex('f_nc_1', '+ ticker: string\n+ market: "IN" | "US"\n+ currency: "INR" | "USD"\n+ market_data: MarketDataMetrics\n+ income_statement: IncomeMetrics\n+ balance_sheet: BalanceSheetMetrics\n+ cash_flow: CashFlowMetrics\n+ forensics: ForensicsMetrics', itemStyle, 0, 30, 300, 120, cNcfContract);
  d.addVertex('f_nc_div', '', dividerStyle, 0, 150, 300, 5, cNcfContract);
  d.addVertex('f_nc_2', '+ validate(): boolean\n+ toJSON(): string', itemStyle, 0, 155, 300, 35, cNcfContract);

  // PACKAGE 3: Tier 3 - Gatekeeper & Valuation Analysis Engines
  d.addVertex('pkg_tier3', 'Tier 3: Gatekeeper & Valuation Analysis Engines\n(skills/forensic-governance, skills/analyze-*)', pkgStyle('#6D28D9'), 40, 570, 1020, 480);

  // Class: ForensicGovernanceEngine
  const cForensic = d.addVertex('cls_forensic_engine', 'ForensicGovernanceEngine\n«Tier 3 Gatekeeper»', classStyle('#FFE4E6', '#E11D48'), 70, 625, 270, 200, 'pkg_tier3');
  d.addVertex('f_fe_1', '- promoterPledgeThreshold: 20%\n- beneishMScoreLimit: -1.78\n- sloanAccrualUpperLimit: 10%', itemStyle, 0, 30, 270, 55, cForensic);
  d.addVertex('f_fe_div', '', dividerStyle, 0, 85, 270, 5, cForensic);
  d.addVertex('f_fe_2', '+ evaluate(financials): UniformVerdictContract\n+ checkPromoterPledging(): GatekeeperCheck\n+ checkAuditorContinuity(): GatekeeperCheck\n+ computeBeneishMScore(): number\n+ computeSloanAccrualRatio(): number', itemStyle, 0, 90, 270, 95, cForensic);

  // Class: GrahamAnalysisEngine
  const cGraham = d.addVertex('cls_graham_engine', 'GrahamAnalysisEngine\n«Tier 3 Valuation»', classStyle('#EDE9FE', '#7C3AED'), 370, 625, 220, 180, 'pkg_tier3');
  d.addVertex('f_ge_1', '- ncavDiscountReq: 33%\n- pePbCeiling: 22.5', itemStyle, 0, 30, 220, 40, cGraham);
  d.addVertex('f_ge_div', '', dividerStyle, 0, 70, 220, 5, cGraham);
  d.addVertex('f_ge_2', '+ evaluate(financials): UniformVerdict\n+ computeNNWC(): number\n+ computeNCAV(): number\n+ computeGrahamNumberFloor(): number\n+ computeMarginOfSafety(): number', itemStyle, 0, 75, 220, 90, cGraham);

  // Class: LynchAnalysisEngine
  const cLynch = d.addVertex('cls_lynch_engine', 'LynchAnalysisEngine\n«Tier 3 Valuation»', classStyle('#EDE9FE', '#7C3AED'), 620, 625, 200, 180, 'pkg_tier3');
  d.addVertex('f_le_1', '- pegFairValue: 1.0\n- pegBargain: 0.5', itemStyle, 0, 30, 200, 40, cLynch);
  d.addVertex('f_le_div', '', dividerStyle, 0, 70, 200, 5, cLynch);
  d.addVertex('f_le_2', '+ evaluate(financials): UniformVerdict\n+ computePegRatio(): number\n+ computeYieldAdjustedPeg(): number\n+ classifyArchetype(): LynchCategory\n+ detectInventoryVelocityLag(): boolean', itemStyle, 0, 75, 200, 90, cLynch);

  // Class: BuffettMungerEngine
  const cBuffett = d.addVertex('cls_buffett_engine', 'BuffettMungerEngine\n«Tier 3 Valuation»', classStyle('#EDE9FE', '#7C3AED'), 70, 845, 270, 180, 'pkg_tier3');
  d.addVertex('f_be_1', '- minRoicThreshold: 15%\n- minOwnerEarningsYield: 5%', itemStyle, 0, 30, 270, 40, cBuffett);
  d.addVertex('f_be_div', '', dividerStyle, 0, 70, 270, 5, cBuffett);
  d.addVertex('f_be_2', '+ evaluate(financials): UniformVerdict\n+ computeOwnerEarnings(): number\n+ runDuPont5StepDecomposition(): DuPont\n+ evaluateEconomicMoat(): MoatScore\n+ computeROIC(): number', itemStyle, 0, 75, 270, 90, cBuffett);

  // Class: KlarmanSolvencyEngine
  const cKlarman = d.addVertex('cls_klarman_engine', 'KlarmanSolvencyEngine\n«Tier 3 Valuation»', classStyle('#EDE9FE', '#7C3AED'), 370, 845, 230, 180, 'pkg_tier3');
  d.addVertex('f_ke_1', '- altmanDistressThreshold: 1.81\n- maxNetDebtEbitda: 3.5', itemStyle, 0, 30, 230, 40, cKlarman);
  d.addVertex('f_ke_div', '', dividerStyle, 0, 70, 230, 5, cKlarman);
  d.addVertex('f_ke_2', '+ evaluate(financials): UniformVerdict\n+ computeAltmanZScore(): number\n+ computeNetDebtToEbitda(): number\n+ auditDebtMaturityCliff24M(): Stress\n+ computeLiquidationFloor(): number', itemStyle, 0, 75, 230, 90, cKlarman);

  // Contract: UniformVerdictContract
  const cVerdictContract = d.addVertex('cls_uv_contract', 'UniformVerdictContract\n«Canonical DataContract»', classStyle('#F1F5F9', '#64748B'), 630, 845, 260, 180, 'pkg_tier3');
  d.addVertex('f_uv_1', '+ ticker: string\n+ principle_id: PrincipleType\n+ stance: StanceEnum\n+ confidence_score: number\n+ metrics: Record&lt;string, any&gt;\n+ audit_payload: AuditSection\n+ rule_triggers: string[]', itemStyle, 0, 30, 260, 105, cVerdictContract);
  d.addVertex('f_uv_div', '', dividerStyle, 0, 135, 260, 5, cVerdictContract);
  d.addVertex('f_uv_2', '+ validate(): boolean\n+ renderHtmlDashboard(): string', itemStyle, 0, 140, 260, 35, cVerdictContract);

  // PACKAGE 4: Tier 4 - Strategy Orchestration & Guardrail Framework
  d.addVertex('pkg_tier4', 'Tier 4: Strategy Orchestrators & Risk Synthesis\n(skills/holding-blender, skills/strategy-xirr, skills/guardrail-engine, skills/way-long-term-strategy)', pkgStyle('#047857'), 1100, 570, 1100, 880);

  // Class: HoldingBlenderService
  const cBlender = d.addVertex('cls_blender', 'HoldingBlenderService\n«Tier 4 Engine»', classStyle('#D1FAE5', '#059669'), 1130, 625, 280, 190, 'pkg_tier4');
  d.addVertex('f_hb_1', '- accounts: AccountHoldingsSnapshot[]\n- targetCurrency: "INR" | "USD"', itemStyle, 0, 30, 280, 40, cBlender);
  d.addVertex('f_hb_div', '', dividerStyle, 0, 70, 280, 5, cBlender);
  d.addVertex('f_hb_2', '+ blendPositions(): StrategyHoldingsBlended\n+ computeWAC(lots): number\n+ poolCashWithFx(cashBalances, fx): CashPool\n+ preserveLotAttributionTranches(): LotTranche[]\n+ renderBlendedHtml(): string', itemStyle, 0, 75, 280, 100, cBlender);

  // Class: StrategyXirrService
  const cXirr = d.addVertex('cls_xirr', 'StrategyXirrService\n«Tier 4 Engine»', classStyle('#D1FAE5', '#059669'), 1440, 625, 300, 190, 'pkg_tier4');
  d.addVertex('f_sx_1', '- solverTolerance: 1e-7\n- maxIterations: 100\n- subAnnualGuardrailDays: 90', itemStyle, 0, 30, 300, 50, cXirr);
  d.addVertex('f_sx_div', '', dividerStyle, 0, 80, 300, 5, cXirr);
  d.addVertex('f_sx_2', '+ calculateStrategyXirr(cashflows): StrategyXirrReport\n+ aggregateBankExternalCashflows(): Cashflow[]\n+ cancelInternalBrokerTransfers(): Cashflow[]\n+ auditFrictionDrag(brokerage, stt, fx): FrictionReport\n+ newtonRaphsonSolve(flows, dates): number', itemStyle, 0, 85, 300, 95, cXirr);

  // Class: GuardrailEngine
  const cGuardrail = d.addVertex('cls_guardrail', 'GuardrailEngine\n«Tier 4 Risk Engine»', classStyle('#D1FAE5', '#059669'), 1780, 625, 310, 190, 'pkg_tier4');
  d.addVertex('f_ge_s1', '- gatekeepers: UniformVerdictContract[]\n- valuationVerdicts: UniformVerdictContract[]\n- principleWeights: Record&lt;string, number&gt;', itemStyle, 0, 30, 310, 50, cGuardrail);
  d.addVertex('f_ge_sdiv', '', dividerStyle, 0, 80, 310, 5, cGuardrail);
  d.addVertex('f_ge_s2', '+ evaluateSecurity(ticker): SynthesizedVerdict\n+ enforceGatekeeperVetoShortCircuit(): boolean\n+ enforceAsymmetricDownsideGuardrail(): boolean\n+ applyCeilingCapping(stance, flag): StanceEnum\n+ computeWeightedPrincipleScore(): number', itemStyle, 0, 85, 310, 95, cGuardrail);

  // Contract: StrategyHoldingsBlended
  const cBlendedContract = d.addVertex('cls_blended_contract', 'StrategyHoldingsBlended\n«DataContract»', classStyle('#F1F5F9', '#64748B'), 1130, 845, 270, 170, 'pkg_tier4');
  d.addVertex('f_bc_1', '+ strategy_id: string\n+ base_currency: string\n+ positions: BlendedPosition[]\n+ pooled_cash: PooledCashAccount[]\n+ summary: BlendedSummary', itemStyle, 0, 30, 270, 85, cBlendedContract);
  d.addVertex('f_bc_div', '', dividerStyle, 0, 115, 270, 5, cBlendedContract);
  d.addVertex('f_bc_2', '+ validate(): boolean\n+ toJSON(): string', itemStyle, 0, 120, 270, 40, cBlendedContract);

  // Contract: StrategyXirrReport
  const cXirrContract = d.addVertex('cls_xirr_contract', 'StrategyXirrReport\n«DataContract»', classStyle('#F1F5F9', '#64748B'), 1440, 845, 280, 170, 'pkg_tier4');
  d.addVertex('f_xc_1', '+ strategy_id: string\n+ xirr: number\n+ is_sub_annual: boolean\n+ days_held: number\n+ cashflow_events: CashflowEvent[]\n+ friction_breakdown: FrictionSummary', itemStyle, 0, 30, 280, 85, cXirrContract);
  d.addVertex('f_xc_div', '', dividerStyle, 0, 115, 280, 5, cXirrContract);
  d.addVertex('f_xc_2', '+ validate(): boolean\n+ toJSON(): string', itemStyle, 0, 120, 280, 40, cXirrContract);

  // Contract: StrategyVerdictSynthesis
  const cSynthContract = d.addVertex('cls_synth_contract', 'StrategyVerdictSynthesis\n«DataContract»', classStyle('#F1F5F9', '#64748B'), 1780, 845, 290, 170, 'pkg_tier4');
  d.addVertex('f_sc2_1', '+ strategy_id: string\n+ portfolio_verdicts: SecurityVerdict[]\n+ guardrail_summary: GuardrailFlags\n+ disqualified_count: number\n+ capital_at_risk_base: number', itemStyle, 0, 30, 290, 85, cSynthContract);
  d.addVertex('f_sc2_div', '', dividerStyle, 0, 115, 290, 5, cSynthContract);
  d.addVertex('f_sc2_2', '+ validate(): boolean\n+ toJSON(): string', itemStyle, 0, 120, 290, 40, cSynthContract);

  // Class: WayLongTermStrategyOrchestrator
  const cOrch = d.addVertex('cls_master_orch', 'WayLongTermStrategyOrchestrator\n«Master Tier 4 Orchestrator»', classStyle('#D1FAE5', '#059669'), 1250, 1050, 400, 210, 'pkg_tier4');
  d.addVertex('f_mo_1', '- manifestPath: string\n- strategyId: "fundamental_lts" | "fundamental_foreign"\n- outputDir: string', itemStyle, 0, 30, 400, 50, cOrch);
  d.addVertex('f_mo_div', '', dividerStyle, 0, 80, 400, 5, cOrch);
  d.addVertex('f_mo_2', '+ executePipeline(): Promise&lt;StrategyConsolidatedPortfolio&gt;\n+ stage1_bindAccountsAndManifest(): ManifestContext\n+ stage2_blendHoldings(): StrategyHoldingsBlended\n+ stage3_computeXirr(): StrategyXirrReport\n+ stage4_synthesizeGuardrails(): StrategyVerdictSynthesis\n+ stage5_assembleOptionCDashboard(): HTMLString\n+ renderMasterHtml(portfolio): string', itemStyle, 0, 85, 400, 115, cOrch);

  // Class: AuditEmbedder
  const cEmbedder = d.addVertex('cls_audit_embedder', 'AuditEmbedder\n«Option C Compiler Helper»', classStyle('#D1FAE5', '#059669'), 1720, 1050, 330, 150, 'pkg_tier4');
  d.addVertex('f_ae_1', '+ compileEmbeddedAudits(verdicts): EmbeddedAuditsMap\n+ extractForensicsAudit(verdict): object\n+ extractValuationTabModel(verdict): object\n+ sanitizeForScriptInjection(obj): string', itemStyle, 0, 30, 330, 75, cEmbedder);
  d.addVertex('f_ae_div', '', dividerStyle, 0, 105, 330, 5, cEmbedder);
  d.addVertex('f_ae_2', '+ generateTabRoutingJson(audits): string', itemStyle, 0, 110, 330, 30, cEmbedder);

  // Contract: StrategyConsolidatedPortfolio
  const cConsolidatedContract = d.addVertex('cls_consolidated_contract', 'StrategyConsolidatedPortfolio\n«Option C Master DataContract»', classStyle('#FEF3C7', '#D97706'), 1350, 1290, 420, 150, 'pkg_tier4');
  d.addVertex('f_cc_1', '+ manifest_version: "1.0"\n+ strategy_id: string\n+ base_currency: "INR" | "USD"\n+ summary: ConsolidatedExecutiveSummary\n+ blended_holdings: StrategyHoldingsBlended\n+ performance: StrategyXirrReport\n+ verdict_synthesis: StrategyVerdictSynthesis\n+ embedded_audits: Record&lt;ticker, EmbeddedAudits&gt;', itemStyle, 0, 30, 420, 110, cConsolidatedContract);

  // PACKAGE 5: Cross-Cutting Framework & Governance
  d.addVertex('pkg_framework', 'Framework & Governance Infrastructure\n(scripts/framework)', pkgStyle('#475569'), 40, 1090, 960, 430);

  // Class: ContractValidator
  const cContractVal = d.addVertex('cls_contract_val', 'ContractValidator\n«Core Governance Engine»', classStyle('#F1F5F9', '#475569'), 70, 1145, 290, 200, 'pkg_framework');
  d.addVertex('f_cv_1', '- schemas: Map&lt;string, JsonSchema&gt;\n- FINANCIALS_TOP_KEYS: Set&lt;string&gt;\n- GATEKEEPER_STANCES: Set&lt;string&gt;\n- VALUATION_STANCES: Set&lt;string&gt;', itemStyle, 0, 30, 290, 60, cContractVal);
  d.addVertex('f_cv_div', '', dividerStyle, 0, 90, 290, 5, cContractVal);
  d.addVertex('f_cv_2', '+ validateContract(data, schemaName): ValidationResult\n+ validateConsolidatedPortfolio(portfolio): void\n+ validateUniformVerdict(verdict): void\n+ validateFinancialsContract(financials): void\n+ assertStrictTopKeys(obj, allowedKeys): void', itemStyle, 0, 95, 290, 95, cContractVal);

  // Class: ManifestValidator & YamlLoader
  const cManifestVal = d.addVertex('cls_manifest_val', 'ManifestValidator & YamlLoader\n«Manifest Parser»', classStyle('#F1F5F9', '#475569'), 390, 1145, 280, 180, 'pkg_framework');
  d.addVertex('f_mv_1', '- manifestSchema: JsonSchema\n- manifestPath: string', itemStyle, 0, 30, 280, 40, cManifestVal);
  d.addVertex('f_mv_div', '', dividerStyle, 0, 70, 280, 5, cManifestVal);
  d.addVertex('f_mv_2', '+ loadManifestFile(path): InvestmentWaysManifest\n+ validateManifest(manifest): ManifestReport\n+ assertAccountPartitioning(ways): void\n+ resolvePrincipleWeights(wayId): Map&lt;string, number&gt;', itemStyle, 0, 75, 280, 90, cManifestVal);

  // Class: ArtifactHarness
  const cHarness = d.addVertex('cls_artifact_harness', 'ArtifactHarness\n«Offline Quality Verifier»', classStyle('#F1F5F9', '#475569'), 700, 1145, 280, 180, 'pkg_framework');
  d.addVertex('f_ah_1', '- forbiddenProtocols: ["http:", "https:"]\n- externalTagRegexes: RegExp[]', itemStyle, 0, 30, 280, 40, cHarness);
  d.addVertex('f_ah_div', '', dividerStyle, 0, 70, 280, 5, cHarness);
  d.addVertex('f_ah_2', '+ verifyArtifactPair(jsonPath, htmlPath): void\n+ verifyHtmlSelfContainment(htmlContent): AuditResult\n+ checkZeroExternalNetworkLeaks(html): boolean\n+ assertContractSchemaSync(json, html): void', itemStyle, 0, 75, 280, 90, cHarness);

  // Relationships / Connectors
  d.addEdge('r1', '«uses»', depEdgeStyle, 'cls_fetch_angel', 'cls_angel_client');
  d.addEdge('r2', '«uses»', depEdgeStyle, 'cls_fetch_ind', 'cls_ind_client');
  d.addEdge('r3', '«uses»', depEdgeStyle, 'cls_prov_tt', 'cls_tt_client');
  d.addEdge('r4', '«produces»', depEdgeStyle, 'cls_fetch_angel', 'cls_snap_contract');
  d.addEdge('r5', '«produces»', depEdgeStyle, 'cls_fetch_ind', 'cls_snap_contract');
  d.addEdge('r6', '«produces»', depEdgeStyle, 'cls_prov_tt', 'cls_ncf_contract');

  d.addEdge('r7', '«consumes»', depEdgeStyle, 'cls_forensic_engine', 'cls_ncf_contract');
  d.addEdge('r8', '«consumes»', depEdgeStyle, 'cls_graham_engine', 'cls_ncf_contract');
  d.addEdge('r9', '«emits»', depEdgeStyle, 'cls_forensic_engine', 'cls_uv_contract');
  d.addEdge('r10', '«emits»', depEdgeStyle, 'cls_graham_engine', 'cls_uv_contract');

  d.addEdge('r11', '«blends»', depEdgeStyle, 'cls_blender', 'cls_snap_contract');
  d.addEdge('r12', '«produces»', depEdgeStyle, 'cls_blender', 'cls_blended_contract');
  d.addEdge('r13', '«solves»', depEdgeStyle, 'cls_xirr', 'cls_blended_contract');
  d.addEdge('r14', '«produces»', depEdgeStyle, 'cls_xirr', 'cls_xirr_contract');

  d.addEdge('r15', '«synthesizes»', depEdgeStyle, 'cls_guardrail', 'cls_uv_contract');
  d.addEdge('r16', '«produces»', depEdgeStyle, 'cls_guardrail', 'cls_synth_contract');

  d.addEdge('r17', '«coordinates»', compEdgeStyle, 'cls_master_orch', 'cls_blender');
  d.addEdge('r18', '«coordinates»', compEdgeStyle, 'cls_master_orch', 'cls_xirr');
  d.addEdge('r19', '«coordinates»', compEdgeStyle, 'cls_master_orch', 'cls_guardrail');
  d.addEdge('r20', '«embeds»', compEdgeStyle, 'cls_master_orch', 'cls_audit_embedder');

  d.addEdge('r21', '«assembles»', assocEdgeStyle, 'cls_master_orch', 'cls_consolidated_contract');

  d.addEdge('r22', '«validates»', depEdgeStyle, 'cls_contract_val', 'cls_consolidated_contract');
  d.addEdge('r23', '«verifies offline»', depEdgeStyle, 'cls_artifact_harness', 'cls_consolidated_contract');

  return d;
}

// ==============================================================================
// 3. USE CASE DIAGRAM GENERATOR (Subsystems and Use Cases Strictly One After Another)
// ==============================================================================
function buildUseCaseDiagram() {
  const d = new DiagramBuilder('use_case_diag', 'System Use Case Diagram (Strictly Vertical Pipeline)', 1500, 2950);

  // Actor styles
  const actorStyle =
    'shape=umlActor;verticalLabelPosition=bottom;verticalAlign=top;html=1;outlineConnect=0;fillColor=#1E293B;strokeColor=#1E293B;strokeWidth=2;fontFamily=Segoe UI;fontSize=13;fontStyle=1;fontColor=#0F172A;';
  const sysActorStyle =
    'shape=cube;whiteSpace=wrap;html=1;boundedLbl=1;backgroundOutline=1;darkOpacity=0.05;darkOpacity2=0.1;fillColor=#E2E8F0;strokeColor=#475569;strokeWidth=2;fontFamily=Segoe UI;fontSize=12;fontStyle=1;fontColor=#1E293B;';

  // Subsystem Boundary Style
  const boundaryStyle = (title, border, bg = '#F8FAFC') =>
    `swimlane;html=1;startSize=32;fillColor=${bg};swimlaneFillColor=#FFFFFF;strokeColor=${border};strokeWidth=2;fontFamily=Segoe UI;fontSize=13;fontStyle=1;fontColor=#0F172A;rounded=1;shadow=1;`;

  // Use Case Ellipse Style
  const ucStyle = (bg, border) =>
    `ellipse;whiteSpace=wrap;html=1;fillColor=${bg};strokeColor=${border};strokeWidth=1.5;fontFamily=Segoe UI;fontSize=11;fontStyle=1;fontColor=#0F172A;shadow=1;`;

  // Edge styles
  const assocStyle = 'edgeStyle=straight;html=1;strokeColor=#334155;strokeWidth=1.5;endArrow=none;fontFamily=Segoe UI;fontSize=11;fontColor=#334155;';
  const incStyle = 'edgeStyle=orthogonalEdgeStyle;rounded=1;html=1;strokeColor=#0284C7;strokeWidth=1.5;dashed=1;endArrow=open;endSize=8;fontFamily=Segoe UI;fontSize=10;fontColor=#0369A1;';
  const extStyle = 'edgeStyle=orthogonalEdgeStyle;rounded=1;html=1;strokeColor=#E11D48;strokeWidth=1.5;dashed=1;endArrow=open;endSize=8;fontFamily=Segoe UI;fontSize=10;fontColor=#BE123C;';

  // ACTORS (Left Margin)
  d.addVertex('act_investor', 'Retail / Strategic\nInvestor\n(Human)', actorStyle, 80, 800, 45, 90);
  d.addVertex('act_agent', 'Autonomous Strategy\nAgent / CLI Runner\n(Automated)', actorStyle, 80, 1750, 45, 90);

  // External System Actors (Right Margin)
  d.addVertex('sys_angel', 'Angel One\nSmartAPI', sysActorStyle, 1080, 275, 160, 75);
  d.addVertex('sys_ind', 'INDmoney /\nDriveWealth API', sysActorStyle, 1080, 370, 160, 75);
  d.addVertex('sys_tt', 'Tickertape Pro\nPrivate API', sysActorStyle, 1080, 780, 160, 75);
  d.addVertex('sys_fs', 'Local FileSystem\n& Offline Cache', sysActorStyle, 1080, 2300, 160, 75);

  const subX = 350;
  const subW = 620;
  const ucX = 95;
  const ucW = 430;
  const ucH = 65;

  // ============================================================================
  // SUBSYSTEM 1: Stock Accounts System (Top)
  // Use cases placed one after another vertically
  // ============================================================================
  const sub1 = d.addVertex('sub_accounts', '1. Stock Accounts System', boundaryStyle('Stock Accounts System', '#0D9488'), subX, 50, subW, 640);
  const ucAuth = d.addVertex('uc_auth', 'UC1: Authenticate Broker APIs\n(TOTP, JWT, OAuth2)', ucStyle('#CCFBF1', '#0D9488'), ucX, 55, ucW, ucH, sub1);
  const ucRefresh = d.addVertex('uc_token_refresh', 'UC2: Renew Expired Session Tokens\n(SmartAPI & DriveWealth)', ucStyle('#CCFBF1', '#0D9488'), ucX, 150, ucW, ucH, sub1);
  const ucFetchAngel = d.addVertex('uc_fetch_angel', 'UC3: Fetch Angel One Demat Positions\n& Ledger Cash Balances', ucStyle('#CCFBF1', '#0D9488'), ucX, 245, ucW, ucH, sub1);
  const ucFetchInd = d.addVertex('uc_fetch_ind', 'UC4: Fetch INDmoney US Equities,\nFractional Lots & USD Cash', ucStyle('#CCFBF1', '#0D9488'), ucX, 340, ucW, ucH, sub1);
  const ucFetchFx = d.addVertex('uc_fetch_fx', 'UC5: Fetch Live USD/INR Exchange Rate\n& Compute INR Parity', ucStyle('#CCFBF1', '#0D9488'), ucX, 435, ucW, ucH, sub1);
  const ucCacheSnap = d.addVertex('uc_cache_snap', 'UC6: Persist Account Holdings Snapshot\n(Canonical JSON & HTML)', ucStyle('#CCFBF1', '#0D9488'), ucX, 530, ucW, ucH, sub1);

  // Subsystem 1 Relationships
  d.addEdge('e_ext_token', '«extend»\n[on 401/403]', extStyle, ucRefresh, ucAuth, '1', [
    { x: subX + ucX + ucW + 35, y: 50 + 150 + 32 },
    { x: subX + ucX + ucW + 35, y: 50 + 55 + 32 }
  ]);
  d.addEdge('e_inc_fx', '«include»', incStyle, ucFetchInd, ucFetchFx, '1', [
    { x: subX + ucX + ucW + 30, y: 50 + 340 + 32 },
    { x: subX + ucX + ucW + 30, y: 50 + 435 + 32 }
  ]);
  d.addEdge('e_inc_snap1', '«include»', incStyle, ucFetchAngel, ucCacheSnap, '1', [
    { x: subX + ucX - 35, y: 50 + 245 + 32 },
    { x: subX + ucX - 35, y: 50 + 530 + 32 }
  ]);
  d.addEdge('e_inc_snap2', '«include»', incStyle, ucFetchInd, ucCacheSnap, '1', [
    { x: subX + ucX - 20, y: 50 + 340 + 32 },
    { x: subX + ucX - 20, y: 50 + 530 + 32 }
  ]);

  // ============================================================================
  // SUBSYSTEM 2: Stock Info Provider (Placed After Subsystem 1)
  // Use cases placed one after another vertically
  // ============================================================================
  const sub2 = d.addVertex('sub_info_prov', '2. Stock Info Provider', boundaryStyle('Stock Info Provider', '#0284C7'), subX, 730, subW, 550);
  const ucIngestTt = d.addVertex('uc_ingest_tt', 'UC7: Ingest Fundamental Statements\n& Historical Financial Ratios', ucStyle('#E0F2FE', '#0284C7'), ucX, 55, ucW, ucH, sub2);
  const ucCheckCache = d.addVertex('uc_check_cache', 'UC8: Validate 24h Cache\n& Support --refresh Bypass', ucStyle('#E0F2FE', '#0284C7'), ucX, 150, ucW, ucH, sub2);
  const ucNormFin = d.addVertex('uc_norm_fin', 'UC9: Normalize Statements into\nCanonical Company Financials Contract', ucStyle('#E0F2FE', '#0284C7'), ucX, 245, ucW, ucH, sub2);
  const ucValKeys = d.addVertex('uc_val_keys', 'UC10: Validate Strict Top-Level\nFinancials Schema Keys (contract_validator)', ucStyle('#E0F2FE', '#0284C7'), ucX, 340, ucW, ucH, sub2);
  const ucEmitFin = d.addVertex('uc_emit_fin', 'UC11: Emit Financials Contract (JSON)\n& Visual Audit Dashboard HTML', ucStyle('#E0F2FE', '#0284C7'), ucX, 435, ucW, ucH, sub2);

  // Subsystem 2 Relationships
  d.addEdge('e_ext_cache', '«extend»\n[--refresh]', extStyle, ucCheckCache, ucIngestTt, '1', [
    { x: subX + ucX + ucW + 35, y: 730 + 150 + 32 },
    { x: subX + ucX + ucW + 35, y: 730 + 55 + 32 }
  ]);
  d.addEdge('e_inc_norm', '«include»', incStyle, ucIngestTt, ucNormFin, '1', [
    { x: subX + ucX - 25, y: 730 + 55 + 32 },
    { x: subX + ucX - 25, y: 730 + 245 + 32 }
  ]);
  d.addEdge('e_inc_keys', '«include»', incStyle, ucNormFin, ucValKeys, '1', [
    { x: subX + ucX + ucW + 30, y: 730 + 245 + 32 },
    { x: subX + ucX + ucW + 30, y: 730 + 340 + 32 }
  ]);
  d.addEdge('e_inc_emit', '«include»', incStyle, ucNormFin, ucEmitFin, '1', [
    { x: subX + ucX - 35, y: 730 + 245 + 32 },
    { x: subX + ucX - 35, y: 730 + 435 + 32 }
  ]);

  // ============================================================================
  // SUBSYSTEM 3: Stock Analysis System (Placed After Subsystem 2)
  // Use cases placed one after another vertically
  // ============================================================================
  const sub3 = d.addVertex('sub_analysis', '3. Stock Analysis System', boundaryStyle('Stock Analysis System', '#6D28D9'), subX, 1320, subW, 640);
  const ucForensic = d.addVertex('uc_forensic', 'UC12: Forensic Governance Audit\n(Promoter Pledge, Beneish M-Score, Sloan)', ucStyle('#FFE4E6', '#E11D48'), ucX, 55, ucW, ucH, sub3);
  const ucGraham = d.addVertex('uc_graham', 'UC13: Benjamin Graham Deep Value\n(NNWC, NCAV & Margin of Safety Floor)', ucStyle('#EDE9FE', '#7C3AED'), ucX, 150, ucW, ucH, sub3);
  const ucLynch = d.addVertex('uc_lynch', 'UC14: Peter Lynch GARP Analysis\n(PEG Ratio, Archetype, Inventory Lag)', ucStyle('#EDE9FE', '#7C3AED'), ucX, 245, ucW, ucH, sub3);
  const ucBuffett = d.addVertex('uc_buffett', 'UC15: Buffett-Munger Moat Analysis\n(Owner Earnings, 5-Step DuPont, ROIC)', ucStyle('#EDE9FE', '#7C3AED'), ucX, 340, ucW, ucH, sub3);
  const ucKlarman = d.addVertex('uc_klarman', 'UC16: Seth Klarman Solvency Stress\n(Altman Z, 24M Debt Cliff, Net Debt/EBITDA)', ucStyle('#EDE9FE', '#7C3AED'), ucX, 435, ucW, ucH, sub3);
  const ucEmitVerdict = d.addVertex('uc_emit_verdict', 'UC17: Emit Uniform Verdict Contract\n& Self-Contained Pillar HTML Dashboard', ucStyle('#EDE9FE', '#7C3AED'), ucX, 530, ucW, ucH, sub3);

  // Subsystem 3 Relationships
  d.addEdge('e_inc_uv1', '«include»', incStyle, ucForensic, ucEmitVerdict, '1', [
    { x: subX + ucX - 40, y: 1320 + 55 + 32 },
    { x: subX + ucX - 40, y: 1320 + 530 + 32 }
  ]);
  d.addEdge('e_inc_uv2', '«include»', incStyle, ucGraham, ucEmitVerdict, '1', [
    { x: subX + ucX - 30, y: 1320 + 150 + 32 },
    { x: subX + ucX - 30, y: 1320 + 530 + 32 }
  ]);
  d.addEdge('e_inc_uv3', '«include»', incStyle, ucLynch, ucEmitVerdict, '1', [
    { x: subX + ucX - 20, y: 1320 + 245 + 32 },
    { x: subX + ucX - 20, y: 1320 + 530 + 32 }
  ]);
  d.addEdge('e_inc_uv4', '«include»', incStyle, ucBuffett, ucEmitVerdict, '1', [
    { x: subX + ucX + ucW + 25, y: 1320 + 340 + 32 },
    { x: subX + ucX + ucW + 25, y: 1320 + 530 + 32 }
  ]);
  d.addEdge('e_inc_uv5', '«include»', incStyle, ucKlarman, ucEmitVerdict, '1', [
    { x: subX + ucX + ucW + 35, y: 1320 + 435 + 32 },
    { x: subX + ucX + ucW + 35, y: 1320 + 530 + 32 }
  ]);

  // ============================================================================
  // SUBSYSTEM 4: Portfolio Analysis System (Placed After Subsystem 3)
  // Use cases placed one after another vertically
  // ============================================================================
  const sub4 = d.addVertex('sub_portfolio', '4. Portfolio Analysis System', boundaryStyle('Portfolio Analysis System', '#047857'), subX, 2000, subW, 830);
  const ucBlend = d.addVertex('uc_blend', 'UC18: Blend Multi-Account Holdings\n(Compute WAC, Pool FX Cash, Tranches)', ucStyle('#D1FAE5', '#059669'), ucX, 55, ucW, ucH, sub4);
  const ucXirr = d.addVertex('uc_xirr', 'UC19: Compute True Strategy XIRR\n(Newton-Raphson & Itemize Friction Drag)', ucStyle('#D1FAE5', '#059669'), ucX, 150, ucW, ucH, sub4);
  const ucVetoShort = d.addVertex('uc_veto_short', 'UC20: Short-Circuit Vetoed Stocks\n(0.0% Allocation & Flag Disqualified)', ucStyle('#FFE4E6', '#E11D48'), ucX, 245, ucW, ucH, sub4);
  const ucSynth = d.addVertex('uc_synth', 'UC21: Synthesize Weighted Stance\n& Enforce Asymmetric Downside Guardrails', ucStyle('#D1FAE5', '#059669'), ucX, 340, ucW, ucH, sub4);
  const ucMasterCompile = d.addVertex('uc_master_compile', 'UC22: Compile Consolidated Portfolio Contract\n(StrategyConsolidatedPortfolio)', ucStyle('#FEF3C7', '#D97706'), ucX, 435, ucW, ucH, sub4);
  const ucEmbedAudits = d.addVertex('uc_embed_audits', 'UC23: Embed Complete 5-Pillar Audits\ninto Interactive Option C Tab Models', ucStyle('#FEF3C7', '#D97706'), ucX, 530, ucW, ucH, sub4);
  const ucRenderMaster = d.addVertex('uc_render_master', 'UC24: Render 100% Offline Master HTML\nHero KPIs, Holdings Matrix & Waterfall', ucStyle('#FEF3C7', '#D97706'), ucX, 625, ucW, ucH, sub4);
  const ucOfflineAudit = d.addVertex('uc_offline_audit', 'UC25: Audit Zero External Network Leaks\n& Offline Self-Containment (artifact_harness)', ucStyle('#F1F5F9', '#475569'), ucX, 720, ucW, ucH, sub4);

  // Subsystem 4 Relationships
  d.addEdge('e_ext_veto', '«extend»\n[on VETO_DISQUALIFIED]', extStyle, ucVetoShort, ucSynth, '1', [
    { x: subX + ucX + ucW + 35, y: 2000 + 245 + 32 },
    { x: subX + ucX + ucW + 35, y: 2000 + 340 + 32 }
  ]);
  d.addEdge('e_inc_embed', '«include»', incStyle, ucMasterCompile, ucEmbedAudits, '1', [
    { x: subX + ucX + ucW + 30, y: 2000 + 435 + 32 },
    { x: subX + ucX + ucW + 30, y: 2000 + 530 + 32 }
  ]);
  d.addEdge('e_inc_render', '«include»', incStyle, ucMasterCompile, ucRenderMaster, '1', [
    { x: subX + ucX - 30, y: 2000 + 435 + 32 },
    { x: subX + ucX - 30, y: 2000 + 625 + 32 }
  ]);
  d.addEdge('e_inc_oaudit', '«include»', incStyle, ucRenderMaster, ucOfflineAudit, '1', [
    { x: subX + ucX + ucW + 30, y: 2000 + 625 + 32 },
    { x: subX + ucX + ucW + 30, y: 2000 + 720 + 32 }
  ]);

  // ASSOCIATIONS FROM ACTORS
  // Investor Associations
  d.addEdge('a_inv_blend', '', assocStyle, 'act_investor', ucBlend);
  d.addEdge('a_inv_xirr', '', assocStyle, 'act_investor', ucXirr);
  d.addEdge('a_inv_view', '', assocStyle, 'act_investor', ucRenderMaster);

  // Agent / CLI Associations
  d.addEdge('a_ag_auth', '', assocStyle, 'act_agent', ucAuth);
  d.addEdge('a_ag_fetch_a', '', assocStyle, 'act_agent', ucFetchAngel);
  d.addEdge('a_ag_fetch_i', '', assocStyle, 'act_agent', ucFetchInd);
  d.addEdge('a_ag_tt', '', assocStyle, 'act_agent', ucIngestTt);
  d.addEdge('a_ag_orch', '', assocStyle, 'act_agent', ucMasterCompile);

  // External System Associations
  d.addEdge('a_sys_angel', '', assocStyle, ucFetchAngel, 'sys_angel');
  d.addEdge('a_sys_ind', '', assocStyle, ucFetchInd, 'sys_ind');
  d.addEdge('a_sys_tt', '', assocStyle, ucIngestTt, 'sys_tt');
  d.addEdge('a_sys_fs_snap', '', assocStyle, ucCacheSnap, 'sys_fs');
  d.addEdge('a_sys_fs_fin', '', assocStyle, ucEmitFin, 'sys_fs');
  d.addEdge('a_sys_fs_verd', '', assocStyle, ucEmitVerdict, 'sys_fs');
  d.addEdge('a_sys_fs_master', '', assocStyle, ucRenderMaster, 'sys_fs');

  return d;
}

// ==============================================================================
// 4. SEQUENCE DIAGRAM GENERATOR
// ==============================================================================
function buildSequenceDiagram() {
  const d = new DiagramBuilder('seq_diag', 'End-to-End Orchestration Sequence Diagram', 2800, 2400);

  // Lifeline styling
  const llHeadStyle = (bg, border, text = '#0F172A') =>
    `shape=umlLifeline;perimeter=lifelinePerimeter;whiteSpace=wrap;html=1;container=1;collapsible=0;recursiveResize=0;outlineConnect=0;fillColor=${bg};strokeColor=${border};strokeWidth=2;fontFamily=Segoe UI;fontSize=12;fontStyle=1;fontColor=${text};size=40;shadow=1;`;
  const actBoxStyle =
    'html=1;points=[];perimeter=orthogonalPerimeter;fillColor=#E2E8F0;strokeColor=#475569;strokeWidth=1;';
  const syncMsgStyle = 'edgeStyle=orthogonalEdgeStyle;rounded=0;html=1;strokeColor=#1E293B;strokeWidth=1.5;endArrow=block;endFill=1;fontFamily=Segoe UI;fontSize=11;fontColor=#0F172A;';
  const retMsgStyle = 'edgeStyle=orthogonalEdgeStyle;rounded=0;html=1;strokeColor=#64748B;strokeWidth=1.5;dashed=1;endArrow=open;endSize=8;fontFamily=Segoe UI;fontSize=11;fontColor=#475569;';
  const alertMsgStyle = 'edgeStyle=orthogonalEdgeStyle;rounded=0;html=1;strokeColor=#E11D48;strokeWidth=2;dashed=1;endArrow=block;endFill=1;fontFamily=Segoe UI;fontSize=11;fontColor=#BE123C;';

  // Fragments (Alt / Par)
  const fragmentStyle = (title, border, bg = '#F8FAFC') =>
    `shape=umlFrame;whiteSpace=wrap;html=1;width=100;height=25;fontFamily=Segoe UI;fontSize=11;fontStyle=1;align=center;fillColor=${bg};strokeColor=${border};strokeWidth=1.5;shadow=0;`;

  // Participants
  const lifelines = [
    { id: 'll_user', name: 'User / CLI', x: 40, width: 120, bg: '#F1F5F9', border: '#475569' },
    { id: 'll_orch', name: ':WayOrchestrator\n(Tier 4)', x: 220, width: 140, bg: '#D1FAE5', border: '#059669' },
    { id: 'll_man', name: ':ManifestValidator\n(Framework)', x: 420, width: 140, bg: '#F1F5F9', border: '#475569' },
    { id: 'll_fetch_a', name: ':FetchAngelOne\n(Tier 2)', x: 620, width: 130, bg: '#E0F2FE', border: '#0284C7' },
    { id: 'll_fetch_i', name: ':FetchIndmoneyUs\n(Tier 2)', x: 810, width: 140, bg: '#E0F2FE', border: '#0284C7' },
    { id: 'll_blender', name: ':HoldingBlender\n(Tier 4)', x: 1010, width: 130, bg: '#D1FAE5', border: '#059669' },
    { id: 'll_xirr', name: ':StrategyXirr\n(Tier 4)', x: 1200, width: 130, bg: '#D1FAE5', border: '#059669' },
    { id: 'll_tt', name: ':ProviderTickertape\n(Tier 2)', x: 1390, width: 140, bg: '#E0F2FE', border: '#0284C7' },
    { id: 'll_fg', name: ':ForensicGov\n(Tier 3 Gatekeeper)', x: 1590, width: 140, bg: '#FFE4E6', border: '#E11D48' },
    { id: 'll_val', name: ':ValuationEngines\n(Graham/Lynch/BM/KS)', x: 1790, width: 150, bg: '#EDE9FE', border: '#7C3AED' },
    { id: 'll_gr', name: ':GuardrailEngine\n(Tier 4)', x: 2000, width: 130, bg: '#D1FAE5', border: '#059669' },
    { id: 'll_embed', name: ':AuditEmbedder\n(Tier 4)', x: 2190, width: 130, bg: '#D1FAE5', border: '#059669' },
    { id: 'll_harness', name: ':ArtifactHarness\n(Framework)', x: 2380, width: 130, bg: '#F1F5F9', border: '#475569' },
    { id: 'll_fs', name: ':FileSystem\n(Reports)', x: 2570, width: 110, bg: '#FEF3C7', border: '#D97706' }
  ];

  const llHeight = 2250;
  for (const ll of lifelines) {
    d.addVertex(ll.id, ll.name, llHeadStyle(ll.bg, ll.border), ll.x, 50, ll.width, llHeight);
  }

  // 1. Initiate Execution
  d.addEdge('s_msg1', 'executePipeline(fundamental_lts)', syncMsgStyle, 'll_user', 'll_orch', '1', [
    { x: 100, y: 130 },
    { x: 290, y: 130 }
  ]);

  // 2. Load and Validate Manifest
  d.addEdge('s_msg2', 'loadManifestFile("config/investment_ways.yaml")', syncMsgStyle, 'll_orch', 'll_man', '1', [
    { x: 290, y: 160 },
    { x: 490, y: 160 }
  ]);
  d.addEdge('s_ret2', 'return ValidatedManifest {accounts, principles, weights}', retMsgStyle, 'll_man', 'll_orch', '1', [
    { x: 490, y: 195 },
    { x: 290, y: 195 }
  ]);

  // 3. Parallel Ingestion Frame
  d.addVertex('frame_par_ingest', 'par [Parallel Broker Demat Ingestion]', fragmentStyle('par', '#0284C7', 'none'), 250, 220, 680, 210);

  // Ingest Angel One
  d.addEdge('s_msg3', 'fetchHoldings({ refresh: false })', syncMsgStyle, 'll_orch', 'll_fetch_a', '1', [
    { x: 290, y: 255 },
    { x: 685, y: 255 }
  ]);
  d.addEdge('s_ret3', 'return AccountHoldingsSnapshot (IN Equities, Cash)', retMsgStyle, 'll_fetch_a', 'll_orch', '1', [
    { x: 685, y: 300 },
    { x: 290, y: 300 }
  ]);

  // Ingest INDmoney
  d.addEdge('s_msg4', 'fetchHoldings({ refresh: false })', syncMsgStyle, 'll_orch', 'll_fetch_i', '1', [
    { x: 290, y: 345 },
    { x: 880, y: 345 }
  ]);
  d.addEdge('s_ret4', 'return AccountHoldingsSnapshot (US Equities, FX=86.2)', retMsgStyle, 'll_fetch_i', 'll_orch', '1', [
    { x: 880, y: 395 },
    { x: 290, y: 395 }
  ]);

  // 4. Holding Blender
  d.addEdge('s_msg5', 'blendPositions([angelone_snap, indmoney_snap])', syncMsgStyle, 'll_orch', 'll_blender', '1', [
    { x: 290, y: 465 },
    { x: 1075, y: 465 }
  ]);
  d.addEdge('s_ret5', 'return StrategyHoldingsBlended (WAC, Pooled Cash, Lots)', retMsgStyle, 'll_blender', 'll_orch', '1', [
    { x: 1075, y: 515 },
    { x: 290, y: 515 }
  ]);

  // 5. Strategy XIRR
  d.addEdge('s_msg6', 'calculateStrategyXirr(blendedHoldings, bankLedger)', syncMsgStyle, 'll_orch', 'll_xirr', '1', [
    { x: 290, y: 565 },
    { x: 1265, y: 565 }
  ]);
  d.addEdge('s_ret6', 'return StrategyXirrReport {xirr: 24.8%, frictionSummary}', retMsgStyle, 'll_xirr', 'll_orch', '1', [
    { x: 1265, y: 615 },
    { x: 290, y: 615 }
  ]);

  // 6. Security Analysis Loop Frame
  d.addVertex('frame_loop_sec', 'loop [For each distinct holding ticker in portfolio]', fragmentStyle('loop', '#6D28D9', 'none'), 240, 660, 1920, 890);

  // Fetch Tickertape Market Fundamentals
  d.addEdge('s_msg7', 'ingestCompany(ticker, market)', syncMsgStyle, 'll_orch', 'll_tt', '1', [
    { x: 290, y: 700 },
    { x: 1460, y: 700 }
  ]);
  d.addEdge('s_ret7', 'return NormalizedCompanyFinancials (P&L, BS, CF, Forensics)', retMsgStyle, 'll_tt', 'll_orch', '1', [
    { x: 1460, y: 750 },
    { x: 290, y: 750 }
  ]);

  // Run Forensic Governance Gatekeeper Audit
  d.addEdge('s_msg8', 'evaluate(financials)', syncMsgStyle, 'll_orch', 'll_fg', '1', [
    { x: 290, y: 800 },
    { x: 1660, y: 800 }
  ]);
  d.addEdge('s_ret8', 'return UniformVerdictContract {stance: PASS|FLAG|VETO_DISQUALIFIED}', retMsgStyle, 'll_fg', 'll_orch', '1', [
    { x: 1660, y: 850 },
    { x: 290, y: 850 }
  ]);

  // Alt Fragment: Gatekeeper VETO vs PASS
  d.addVertex('frame_alt_veto', 'alt [Gatekeeper Stance == VETO_DISQUALIFIED]', fragmentStyle('alt', '#E11D48', 'none'), 260, 890, 1870, 630);

  // VETO Short-Circuit Branch
  d.addEdge('s_msg9a', 'shortCircuitDisqualification(ticker, reason)', alertMsgStyle, 'll_orch', 'll_gr', '1', [
    { x: 290, y: 940 },
    { x: 2065, y: 940 }
  ]);
  d.addEdge('s_ret9a', 'return SynthesizedVerdict {stance: DISQUALIFIED, target_weight: 0.0%}', retMsgStyle, 'll_gr', 'll_orch', '1', [
    { x: 2065, y: 990 },
    { x: 290, y: 990 }
  ]);

  // Else: Evaluate Valuation Principles (Divider at y=1030)
  d.addVertex('alt_else_div', '[else: Gatekeeper PASS or FLAG]', 'text;html=1;strokeColor=none;fillColor=none;align=left;fontFamily=Segoe UI;fontSize=11;fontStyle=1;fontColor=#047857;', 280, 1040, 220, 25);

  d.addVertex('frame_par_val', 'par [Evaluate 4 Valuation Principles in Parallel]', fragmentStyle('par', '#7C3AED', 'none'), 270, 1080, 1600, 280);

  d.addEdge('s_msg10a', 'evaluateGraham(financials)', syncMsgStyle, 'll_orch', 'll_val', '1', [
    { x: 290, y: 1120 },
    { x: 1865, y: 1120 }
  ]);
  d.addEdge('s_msg10b', 'evaluateLynch(financials)', syncMsgStyle, 'll_orch', 'll_val', '1', [
    { x: 290, y: 1160 },
    { x: 1865, y: 1160 }
  ]);
  d.addEdge('s_msg10c', 'evaluateBuffettMunger(financials)', syncMsgStyle, 'll_orch', 'll_val', '1', [
    { x: 290, y: 1200 },
    { x: 1865, y: 1200 }
  ]);
  d.addEdge('s_msg10d', 'evaluateKlarmanSolvency(financials)', syncMsgStyle, 'll_orch', 'll_val', '1', [
    { x: 290, y: 1240 },
    { x: 1865, y: 1240 }
  ]);
  d.addEdge('s_ret10', 'return [GrahamVerdict, LynchVerdict, BuffettVerdict, KlarmanVerdict]', retMsgStyle, 'll_val', 'll_orch', '1', [
    { x: 1865, y: 1300 },
    { x: 290, y: 1300 }
  ]);

  // Synthesize Guardrails
  d.addEdge('s_msg11', 'evaluateSecurity(ticker, gatekeeper, valuationVerdicts, weights)', syncMsgStyle, 'll_orch', 'll_gr', '1', [
    { x: 290, y: 1400 },
    { x: 2065, y: 1400 }
  ]);
  d.addEdge('s_ret11', 'return SynthesizedVerdict {stance, guardrail_flags, synthesized_score}', retMsgStyle, 'll_gr', 'll_orch', '1', [
    { x: 2065, y: 1470 },
    { x: 290, y: 1470 }
  ]);

  // Stage 5: Option C Consolidated Master Assembly
  d.addEdge('s_msg12', 'compileEmbeddedAudits(portfolioVerdicts)', syncMsgStyle, 'll_orch', 'll_embed', '1', [
    { x: 290, y: 1600 },
    { x: 2255, y: 1600 }
  ]);
  d.addEdge('s_ret12', 'return EmbeddedAuditsMap {tabs, payloads, metrics}', retMsgStyle, 'll_embed', 'll_orch', '1', [
    { x: 2255, y: 1650 },
    { x: 290, y: 1650 }
  ]);

  d.addEdge('s_msg13', 'compileConsolidatedPortfolio({ blended, xirr, synthesis, audits })', syncMsgStyle, 'll_orch', 'll_orch', '1', [
    { x: 290, y: 1700 },
    { x: 350, y: 1700 },
    { x: 350, y: 1730 },
    { x: 290, y: 1730 }
  ]);

  // Validation & Harness Verification
  d.addEdge('s_msg14', 'verifyArtifactPair(jsonArtifact, renderedHtmlDashboard)', syncMsgStyle, 'll_orch', 'll_harness', '1', [
    { x: 290, y: 1780 },
    { x: 2445, y: 1780 }
  ]);
  d.addEdge('s_msg15', 'auditOfflineSelfContainment(html): check zero external scripts/CDNs', syncMsgStyle, 'll_harness', 'll_harness', '1', [
    { x: 2445, y: 1820 },
    { x: 2505, y: 1820 },
    { x: 2505, y: 1850 },
    { x: 2445, y: 1850 }
  ]);
  d.addEdge('s_ret14', 'return { schemaValid: true, offlineVerified: true, leaksCount: 0 }', retMsgStyle, 'll_harness', 'll_orch', '1', [
    { x: 2445, y: 1890 },
    { x: 290, y: 1890 }
  ]);

  // Persist Artifacts to FileSystem
  d.addEdge('s_msg16', 'writeFileSync("reports/strategies/fundamental_lts.json", jsonPayload)', syncMsgStyle, 'll_orch', 'll_fs', '1', [
    { x: 290, y: 1950 },
    { x: 2625, y: 1950 }
  ]);
  d.addEdge('s_msg17', 'writeFileSync("reports/strategies/fundamental_lts.html", htmlPayload)', syncMsgStyle, 'll_orch', 'll_fs', '1', [
    { x: 290, y: 2000 },
    { x: 2625, y: 2000 }
  ]);

  // Return to User / CLI
  d.addEdge('s_ret_final', 'Emit CLI Summary & Dashboard URL (Exit Code 0)', retMsgStyle, 'll_orch', 'll_user', '1', [
    { x: 290, y: 2080 },
    { x: 100, y: 2080 }
  ]);

  return d;
}

// ==============================================================================
// MAIN EXECUTION & FILE WRITING
// ==============================================================================
function main() {
  console.log('Generating Draw.io architectural diagrams...');

  if (!fs.existsSync(DESIGN_DIR)) {
    fs.mkdirSync(DESIGN_DIR, { recursive: true });
  }

  // 1. Build Activity Diagram
  const activityDiag = buildActivityDiagram();
  const activityXml = wrapMxFile([activityDiag.toXmlDiagram()]);
  const activityPath = path.join(DESIGN_DIR, 'activity_diagram.drawio');
  fs.writeFileSync(activityPath, activityXml, 'utf8');
  console.log(`✓ Activity Diagram generated: ${activityPath}`);

  // 2. Build Component & Class Diagram
  const compClassDiag = buildComponentClassDiagram();
  const compClassXml = wrapMxFile([compClassDiag.toXmlDiagram()]);
  const compClassPath = path.join(DESIGN_DIR, 'component_class_diagram.drawio');
  fs.writeFileSync(compClassPath, compClassXml, 'utf8');
  console.log(`✓ Component & Class Diagram generated: ${compClassPath}`);

  // 3. Build Use Case Diagram
  const useCaseDiag = buildUseCaseDiagram();
  const useCaseXml = wrapMxFile([useCaseDiag.toXmlDiagram()]);
  const useCasePath = path.join(DESIGN_DIR, 'use_case_diagram.drawio');
  fs.writeFileSync(useCasePath, useCaseXml, 'utf8');
  console.log(`✓ Use Case Diagram generated: ${useCasePath}`);

  // 4. Build Sequence Diagram
  const seqDiag = buildSequenceDiagram();
  const seqXml = wrapMxFile([seqDiag.toXmlDiagram()]);
  const seqPath = path.join(DESIGN_DIR, 'sequence_diagram.drawio');
  fs.writeFileSync(seqPath, seqXml, 'utf8');
  console.log(`✓ Sequence Diagram generated: ${seqPath}`);

  // 5. Build Master Multi-Page Architecture Workbook
  const masterXml = wrapMxFile([
    compClassDiag.toXmlDiagram(),
    activityDiag.toXmlDiagram(),
    useCaseDiag.toXmlDiagram(),
    seqDiag.toXmlDiagram()
  ]);
  const masterPath = path.join(DESIGN_DIR, 'architecture_master.drawio');
  fs.writeFileSync(masterPath, masterXml, 'utf8');
  console.log(`✓ Master Multi-Page Architecture Workbook generated: ${masterPath}`);

  console.log('All Draw.io diagrams successfully generated!');
}

if (require.main === module) {
  main();
}

