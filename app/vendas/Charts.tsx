"use client";

import { useMemo, useRef, useState } from "react";

const BRAND = "#3956e8";
const SURFACE = "#ffffff";
const GRID = "#e8eaf0";
const TEXT_MUTED = "#8a8f9c";
const CORES_DONUT = ["#3956e8", "#22c55e", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4", "#ec4899", "#64748b"];

function formatarMoedaCompacta(valor: number): string {
  if (Math.abs(valor) >= 1000) {
    return `R$ ${(valor / 1000).toFixed(1).replace(".", ",")}K`;
  }
  return `R$ ${valor.toFixed(0)}`;
}

function formatarDiaCurto(diaIso: string): string {
  // diaIso: "YYYY-MM-DD" (dia) ou "YYYY-MM" (mês)
  const partes = diaIso.split("-");
  if (partes.length === 2) {
    const meses = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
    return meses[Number(partes[1]) - 1] ?? diaIso;
  }
  return `${partes[2]}/${partes[1]}`;
}

/** Arredonda o teto do eixo Y para um número "redondo" (1, 2, 5 x 10^n). */
function tetoAgradavel(valor: number): number {
  if (valor <= 0) return 10;
  const exp = Math.floor(Math.log10(valor));
  const base = Math.pow(10, exp);
  const normalizado = valor / base;
  const passo = normalizado <= 1 ? 1 : normalizado <= 2 ? 2 : normalizado <= 5 ? 5 : 10;
  return passo * base;
}

const WIDTH = 640;
const HEIGHT = 320;
const PAD = { top: 16, right: 16, bottom: 28, left: 48 };
const PLOT_W = WIDTH - PAD.left - PAD.right;
const PLOT_H = HEIGHT - PAD.top - PAD.bottom;

interface PontoBarra {
  dia: string;
  total: number;
}

export function BarChart({ data }: { data: PontoBarra[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const ref = useRef<SVGSVGElement>(null);

  const teto = useMemo(() => tetoAgradavel(Math.max(...data.map((d) => d.total), 0) * 1.15), [data]);

  if (data.length === 0) {
    return <p className="vendas-chart-vazio">Sem vendas no período selecionado.</p>;
  }

  const bandWidth = PLOT_W / data.length;
  const barWidth = Math.min(24, bandWidth * 0.6);

  function xCentro(i: number) {
    return PAD.left + bandWidth * i + bandWidth / 2;
  }
  function yFor(valor: number) {
    return PAD.top + PLOT_H * (1 - valor / teto);
  }

  function onMove(e: React.PointerEvent<SVGSVGElement>) {
    const svg = ref.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const xRel = ((e.clientX - rect.left) / rect.width) * WIDTH;
    const i = Math.min(data.length - 1, Math.max(0, Math.round((xRel - PAD.left - bandWidth / 2) / bandWidth)));
    setHover(i);
  }

  // rótulos do eixo X: no máximo ~7, espaçados
  const passoLabel = Math.max(1, Math.ceil(data.length / 7));

  const ativo = hover ?? data.length - 1;
  const pontoAtivo = data[ativo];

  return (
    <div className="vendas-chart-wrap">
      <svg
        ref={ref}
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="vendas-chart-svg"
        onPointerMove={onMove}
        onPointerLeave={() => setHover(null)}
        role="img"
        aria-label="Vendas por dia"
      >
        {[0, 0.5, 1].map((f) => (
          <line
            key={f}
            x1={PAD.left}
            x2={WIDTH - PAD.right}
            y1={PAD.top + PLOT_H * (1 - f)}
            y2={PAD.top + PLOT_H * (1 - f)}
            stroke={GRID}
            strokeWidth={1}
          />
        ))}
        {[0, 0.5, 1].map((f) => (
          <text
            key={f}
            x={PAD.left - 8}
            y={PAD.top + PLOT_H * (1 - f) + 4}
            textAnchor="end"
            fontSize={10}
            fill={TEXT_MUTED}
          >
            {formatarMoedaCompacta(teto * f)}
          </text>
        ))}

        {data.map((d, i) => {
          const x = xCentro(i) - barWidth / 2;
          const y = yFor(d.total);
          const h = PAD.top + PLOT_H - y;
          const isHover = hover === i;
          return (
            <g key={d.dia}>
              <rect
                x={x}
                y={y}
                width={barWidth}
                height={Math.max(h, 1)}
                rx={4}
                fill={BRAND}
                opacity={isHover ? 1 : 0.85}
              />
              {i % passoLabel === 0 && (
                <text x={xCentro(i)} y={HEIGHT - 8} textAnchor="middle" fontSize={10} fill={TEXT_MUTED}>
                  {formatarDiaCurto(d.dia)}
                </text>
              )}
            </g>
          );
        })}

        {hover !== null && (
          <line
            x1={xCentro(hover)}
            x2={xCentro(hover)}
            y1={PAD.top}
            y2={PAD.top + PLOT_H}
            stroke={BRAND}
            strokeWidth={1}
            strokeDasharray="2,2"
            opacity={0.5}
          />
        )}
      </svg>

      {pontoAtivo && (
        <div className="vendas-chart-tooltip" style={{ left: `${(xCentro(ativo) / WIDTH) * 100}%` }}>
          <strong>{formatarMoedaCompacta(pontoAtivo.total)}</strong>
          <span>{formatarDiaCurto(pontoAtivo.dia)}</span>
        </div>
      )}
    </div>
  );
}

interface FatiaDonut {
  label: string;
  valor: number;
  percentual: number;
}

const DONUT_RAIO = 62;
const DONUT_CENTRO = 80;
const DONUT_ESPESSURA = 26;
const DONUT_CIRCUNFERENCIA = 2 * Math.PI * DONUT_RAIO;

export function DonutChart({ data }: { data: FatiaDonut[] }) {
  if (data.length === 0) {
    return <p className="vendas-chart-vazio">Sem dados no período selecionado.</p>;
  }

  const comprimentos = data.map((d) => (d.percentual / 100) * DONUT_CIRCUNFERENCIA);
  const fatias = data.map((d, i) => {
    const comprimento = comprimentos[i];
    const antes = comprimentos.slice(0, i).reduce((soma, c) => soma + c, 0);
    return {
      ...d,
      cor: CORES_DONUT[i % CORES_DONUT.length],
      dasharray: `${comprimento} ${Math.max(DONUT_CIRCUNFERENCIA - comprimento, 0)}`,
      dashoffset: -antes,
    };
  });

  return (
    <div className="vendas-donut-wrap">
      <svg
        viewBox={`0 0 ${DONUT_CENTRO * 2} ${DONUT_CENTRO * 2}`}
        className="vendas-donut-svg"
        role="img"
        aria-label="Receita por dispositivo"
      >
        <circle cx={DONUT_CENTRO} cy={DONUT_CENTRO} r={DONUT_RAIO} fill="none" stroke={GRID} strokeWidth={DONUT_ESPESSURA} />
        {fatias.map((f) => (
          <circle
            key={f.label}
            cx={DONUT_CENTRO}
            cy={DONUT_CENTRO}
            r={DONUT_RAIO}
            fill="none"
            stroke={f.cor}
            strokeWidth={DONUT_ESPESSURA}
            strokeDasharray={f.dasharray}
            strokeDashoffset={f.dashoffset}
            transform={`rotate(-90 ${DONUT_CENTRO} ${DONUT_CENTRO})`}
          />
        ))}
      </svg>
      <ul className="vendas-donut-legenda">
        {fatias.map((f) => (
          <li key={f.label}>
            <span className="vendas-donut-dot" style={{ background: f.cor }} />
            <span className="vendas-donut-label">{f.label}</span>
            <strong>{f.percentual.toFixed(1)}%</strong>
          </li>
        ))}
      </ul>
    </div>
  );
}

interface PontoLinha {
  dia: string;
  acumulado: number;
}

export function LineChart({ data }: { data: PontoLinha[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const ref = useRef<SVGSVGElement>(null);

  const teto = useMemo(() => tetoAgradavel(Math.max(...data.map((d) => d.acumulado), 0) * 1.1), [data]);

  if (data.length === 0) {
    return <p className="vendas-chart-vazio">Sem vendas no período selecionado.</p>;
  }

  function xFor(i: number) {
    return data.length === 1 ? PAD.left + PLOT_W / 2 : PAD.left + (PLOT_W * i) / (data.length - 1);
  }
  function yFor(valor: number) {
    return PAD.top + PLOT_H * (1 - valor / teto);
  }

  const pathD = data.map((d, i) => `${i === 0 ? "M" : "L"} ${xFor(i)} ${yFor(d.acumulado)}`).join(" ");
  const areaD = `${pathD} L ${xFor(data.length - 1)} ${PAD.top + PLOT_H} L ${xFor(0)} ${PAD.top + PLOT_H} Z`;

  function onMove(e: React.PointerEvent<SVGSVGElement>) {
    const svg = ref.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const xRel = ((e.clientX - rect.left) / rect.width) * WIDTH;
    let melhor = 0;
    let menorDist = Infinity;
    data.forEach((_, i) => {
      const dist = Math.abs(xFor(i) - xRel);
      if (dist < menorDist) {
        menorDist = dist;
        melhor = i;
      }
    });
    setHover(melhor);
  }

  const passoLabel = Math.max(1, Math.ceil(data.length / 7));
  const ativo = hover ?? data.length - 1;
  const pontoAtivo = data[ativo];

  return (
    <div className="vendas-chart-wrap">
      <svg
        ref={ref}
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="vendas-chart-svg"
        onPointerMove={onMove}
        onPointerLeave={() => setHover(null)}
        role="img"
        aria-label="Receita acumulada"
      >
        {[0, 0.5, 1].map((f) => (
          <line
            key={f}
            x1={PAD.left}
            x2={WIDTH - PAD.right}
            y1={PAD.top + PLOT_H * (1 - f)}
            y2={PAD.top + PLOT_H * (1 - f)}
            stroke={GRID}
            strokeWidth={1}
          />
        ))}
        {[0, 0.5, 1].map((f) => (
          <text
            key={f}
            x={PAD.left - 8}
            y={PAD.top + PLOT_H * (1 - f) + 4}
            textAnchor="end"
            fontSize={10}
            fill={TEXT_MUTED}
          >
            {formatarMoedaCompacta(teto * f)}
          </text>
        ))}

        <path d={areaD} fill={BRAND} opacity={0.1} stroke="none" />
        <path d={pathD} fill="none" stroke={BRAND} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />

        {data.map(
          (d, i) =>
            i % passoLabel === 0 && (
              <text key={d.dia} x={xFor(i)} y={HEIGHT - 8} textAnchor="middle" fontSize={10} fill={TEXT_MUTED}>
                {formatarDiaCurto(d.dia)}
              </text>
            )
        )}

        {hover !== null && (
          <line
            x1={xFor(hover)}
            x2={xFor(hover)}
            y1={PAD.top}
            y2={PAD.top + PLOT_H}
            stroke={BRAND}
            strokeWidth={1}
            strokeDasharray="2,2"
            opacity={0.5}
          />
        )}

        <circle cx={xFor(ativo)} cy={yFor(pontoAtivo.acumulado)} r={4} fill={BRAND} stroke={SURFACE} strokeWidth={2} />
      </svg>

      {pontoAtivo && (
        <div className="vendas-chart-tooltip" style={{ left: `${(xFor(ativo) / WIDTH) * 100}%` }}>
          <strong>{formatarMoedaCompacta(pontoAtivo.acumulado)}</strong>
          <span>{formatarDiaCurto(pontoAtivo.dia)}</span>
        </div>
      )}
    </div>
  );
}
