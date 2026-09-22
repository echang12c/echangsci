import {
  getHouseBills, getHouseBillNames, getHouseMonthly, houseFiltersFromParams, currentMonth,
} from '@/lib/house';
import CasaFilterBar from '@/components/CasaFilterBar';
import HouseBillsManager from '@/components/HouseBillsManager';
import HouseBillsLineChart from '@/components/charts/HouseBillsLineChart';

export const dynamic = 'force-dynamic';

const MONTH_NAMES = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
];

function fullMonthLabel(ym: string): string {
  const [y, m] = ym.split('-');
  return `${MONTH_NAMES[Number(m) - 1]} de ${y}`;
}

export default async function CasaPage({
  searchParams,
}: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const filters = houseFiltersFromParams(sp);
  const month = currentMonth();

  const bills = getHouseBills(month);
  const billNames = getHouseBillNames();
  const monthly = getHouseMonthly(filters);

  const chartBill = filters.billId ? billNames.find((b) => b.id === filters.billId) : null;
  const chartTitle = chartBill ? `Gasto mensal · ${chartBill.name}` : 'Gasto mensal · todas as contas';

  return (
    <>
      <h1>Contas da casa</h1>
      <p className="page-sub">
        Aluguel, luz, água, internet — o que se repete todo mês. Marque o que já foi pago em {fullMonthLabel(month)}.
      </p>

      <HouseBillsManager bills={bills} month={month} />

      <CasaFilterBar bills={billNames} />
      <HouseBillsLineChart
        data={monthly}
        title={chartTitle}
        note="Soma de todas as contas por mês, ou de uma conta específica quando você filtra."
      />
    </>
  );
}
