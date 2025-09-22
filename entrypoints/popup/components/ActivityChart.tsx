import { Pie } from 'react-chartjs-2';
import { Chart as ChartJS, ArcElement, Tooltip } from 'chart.js';
import { formatTime } from '../utils/time';
import { PIE_COLORS } from '../utils/constants';

ChartJS.register(ArcElement, Tooltip);

interface Domain {
  domain: string;
  totalTime: number;
  pageCount: number;
  visitCount: number;
}

interface ActivityChartProps {
  domains: Domain[];
}

const ActivityChart = ({ domains }: ActivityChartProps) => {
  if (!domains || domains.length === 0) return null;

  const totalTime = domains.reduce((sum, d) => sum + d.totalTime, 0);
  if (totalTime === 0) return null;

  const topFive = domains.slice(0, 5);
  const topFiveTime = topFive.reduce((sum, d) => sum + d.totalTime, 0);
  const otherTime = totalTime - topFiveTime;

  const chartLabels = topFive.map((d) => d.domain);
  const chartDataValues = topFive.map((d) => d.totalTime);

  if (domains.length > 5 && otherTime > 0) {
    chartLabels.push('Other');
    chartDataValues.push(otherTime);
  }

  const data = {
    labels: chartLabels,
    datasets: [
      {
        data: chartDataValues,
        backgroundColor: PIE_COLORS.slice(0, chartLabels.length),
      },
    ],
  };

  const options = {
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: function (context: any) {
            const value = context.raw;
            const percent = ((value / totalTime) * 100).toFixed(1);
            return `${context.label}: ${formatTime(value)} (${percent}%)`;
          },
        },
      },
    },
  };

  return (
    <section class='activity-chart'>
      <h3>Time Distribution</h3>
      <div class='chart-container'>
        <Pie data={data} options={options} />
      </div>

      <div class='custom-legend'>
        {chartLabels.map((label, index) => (
          <div key={label} class='legend-item'>
            <span
              class='legend-color'
              style={{ backgroundColor: PIE_COLORS[index] }}
            />
            <span class='legend-label'>{label}</span>
            <span class='legend-time'>
              {formatTime(chartDataValues[index])}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
};

export default ActivityChart;
