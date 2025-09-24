import { useState } from 'preact/hooks';
import { formatTime } from '../utils/time';
import { Tab } from '../utils/types';
import { ArrowDown } from 'lucide-react';
import { indicatorColors } from '../../../shared/constants/constants';

interface Domain {
  domain: string;
  totalTime: number;
  pageCount: number;
  visitCount: number;
}

interface WebsiteListProps {
  domains: Domain[];
  groupedTabs: { [key: string]: Tab[] };
  totalTime: number;
}

export default function WebsiteList({
  domains,
  groupedTabs,
  totalTime,
}: WebsiteListProps) {
  const [expandedDomains, setExpandedDomains] = useState<
    Record<string, boolean>
  >({});

  if (!domains.length) {
    return (
      <div className='text-center p-10 text-gray-500'>
        <p className='text-sm mb-1'>No browsing data for today</p>
        <small className='text-xs text-gray-400'>
          Start browsing to see your activity
        </small>
      </div>
    );
  }

  return (
    <div className='flex flex-col gap-2'>
      <h3 className='text-sm font-semibold mb-2'>Today data</h3>
      {domains.slice(0, 8).map((domain, idx) => {
        const percentage = totalTime
          ? ((domain.totalTime / totalTime) * 100).toFixed(1)
          : '0.0';
        const domainTabs = groupedTabs[domain.domain] || [];
        const isExpanded = expandedDomains[domain.domain] || false;

        return (
          <div key={domain.domain + idx} className='flex flex-col gap-1'>
            <button
              className='flex justify-between items-center p-3 bg-white rounded border hover:bg-gray-50 hover:shadow transition-all'
              onClick={() =>
                setExpandedDomains((prev) => ({
                  ...prev,
                  [domain.domain]: !prev[domain.domain],
                }))
              }
            >
              <div className='flex items-center gap-3 min-w-0'>
                <div
                  className='w-3 h-3 rounded-full flex-shrink-0'
                  style={{ backgroundColor: indicatorColors[idx] }}
                ></div>
                <a
                  href={`https://${domain.domain}`}
                  target='_blank'
                  rel='noopener noreferrer'
                  className='truncate text-sm font-medium text-blue-600 hover:underline'
                >
                  {domain.domain}
                </a>
              </div>
              <div className='flex items-center gap-2'>
                <div className='flex flex-col items-end'>
                  <span className='text-sm font-semibold'>{percentage}%</span>
                  <span className='text-xs text-gray-500'>
                    {formatTime(domain.totalTime)}
                  </span>
                </div>
                {domainTabs.length > 0 && (
                  <div className='flex items-center gap-1 text-gray-500'>
                    <ArrowDown
                      className={`w-4 h-4 transition-transform ${
                        isExpanded ? 'rotate-180' : ''
                      }`}
                    />
                    <span className='text-xs font-semibold'>
                      {domainTabs.length}
                    </span>
                  </div>
                )}
              </div>
            </button>

            {isExpanded && domainTabs.length > 0 && (
              <div className='flex flex-col gap-2 mt-1 ml-6'>
                {domainTabs.map((tab, tabIdx) => {
                  const tabPercentage = domain.totalTime
                    ? (
                        ((tab.totalActiveTime || 0) / domain.totalTime) *
                        100
                      ).toFixed(1)
                    : '0.0';
                  return (
                    <div
                      key={tab.url + tabIdx}
                      className='flex justify-between items-center p-2 bg-gray-50 rounded border'
                    >
                      <a
                        href={tab.url}
                        target='_blank'
                        rel='noopener noreferrer'
                        className='truncate text-sm text-blue-600 hover:underline'
                      >
                        {tab.title || tab.url}
                      </a>
                      <div className='flex flex-col items-end'>
                        <span className='text-xs font-semibold'>
                          {tabPercentage}%
                        </span>
                        <span className='text-xs text-gray-500'>
                          {formatTime(tab.totalActiveTime || 0)}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
