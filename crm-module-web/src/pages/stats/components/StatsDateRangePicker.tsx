import dayjs, { type Dayjs } from 'dayjs';
import { DateRangePicker } from '@/components/form';

interface Props {
  value: [Dayjs, Dayjs];
  onChange: (value: [Dayjs, Dayjs]) => void;
  width?: number | string;
}

export default function StatsDateRangePicker({ value, onChange, width = 280 }: Props) {
  return (
    <DateRangePicker
      label=""
      width={width}
      value={[value[0].format('YYYY-MM-DD'), value[1].format('YYYY-MM-DD')]}
      onChange={([start, end]) => {
        if (!start || !end) return;
        onChange([dayjs(start), dayjs(end)]);
      }}
    />
  );
}
