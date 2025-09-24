import { Doughnut } from 'react-chartjs-2';
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from 'chart.js';
import { formatTime } from '../utils/time';

ChartJS.register(ArcElement, Tooltip, Legend);

interface Domain {
  domain: string;
  totalTime: number;
  pageCount: number;
  visitCount: number;
}

interface ActivityChartProps {
  domains: Domain[];
  totalTime: number;
}

const CHART_COLORS = [
  '#FF6B6B', // Red
  '#4ECDC4', // Teal
  '#45B7D1', // Blue
  '#96CEB4', // Green
  '#FECA57', // Yellow
  '#FF9FF3', // Pink
  '#54A0FF', // Light Blue
  '#5F27CD', // Purple
];

const ActivityChart = ({ domains, totalTime }: ActivityChartProps) => {
  if (!domains || domains.length === 0 || totalTime === 0) {
    return (
      <div class='chart-container'>
        <div class='empty-chart'>
          <div class='chart-placeholder'>
            <div class='placeholder-circle'>
              <div class='placeholder-inner'>
                <div class='time-display'>
                  <span class='time-value'>0:00:00</span>
                  <span class='time-label'>No activity</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const topDomains = domains.slice(0, 7);
  const topDomainsTime = topDomains.reduce((sum, d) => sum + d.totalTime, 0);
  const otherTime = totalTime - topDomainsTime;

  const chartLabels = topDomains.map((d) => d.domain);
  const chartData = topDomains.map((d) => d.totalTime);
  const chartColors = CHART_COLORS.slice(0, topDomains.length);

  if (domains.length > 7 && otherTime > 0) {
    chartLabels.push('Other');
    chartData.push(otherTime);
    chartColors.push('#BDC3C7');
  }

  const data = {
    labels: chartLabels,
    datasets: [
      {
        data: chartData,
        backgroundColor: chartColors,
        borderColor: '#FFFFFF',
        borderWidth: 2,
        hoverBorderWidth: 3,
        cutout: '75%',
      },
    ],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: false,
      },
      tooltip: {
        callbacks: {
          label: function (context: any) {
            const value = context.raw;
            const percent = ((value / totalTime) * 100).toFixed(1);
            return `${context.label}: ${formatTime(value)} (${percent}%)`;
          },
        },
        titleColor: '#FFFFFF',
        bodyColor: '#FFFFFF',
        cornerRadius: 8,
        displayColors: true,
      },
    },
    elements: {
      arc: {
        borderRadius: 4,
      },
    },
    animation: {
      animateRotate: true,
      animateScale: false,
      duration: 1000,
    },
  };

  const centerTextPlugin = {
    id: 'centerText',
    afterDraw: (chart: any) => {
      const {
        ctx,
        chartArea: { width, height },
      } = chart;
      const centerX = width / 2;
      const centerY = height / 2;

      ctx.save();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      ctx.fillStyle = '#2C3E50';
      ctx.font =
        'bold 24px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      ctx.fillText(formatTime(totalTime), centerX, centerY - 8);

      ctx.fillStyle = '#7F8C8D';
      ctx.font =
        '12px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      ctx.fillText('Total Time', centerX, centerY + 14);

      ctx.restore();
    },
  };

  ChartJS.register(centerTextPlugin);

  return (
    <div class='chart-container'>
      <div class='doughnut-wrapper'>
        <Doughnut data={data} options={options} plugins={[centerTextPlugin]} />
      </div>
    </div>
  );
};

export default ActivityChart;
