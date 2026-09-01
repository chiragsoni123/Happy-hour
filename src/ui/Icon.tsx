import Svg, { Circle, Path, Rect } from 'react-native-svg';

import { colors } from '@/theme';

/**
 * A small hand-drawn icon set on a 24-unit grid. Custom paths keep the geometry as
 * chunky and rounded as the rest of the interface, and avoid shipping an icon font.
 */
export type IconName =
  | 'home'
  | 'gamepad'
  | 'pool'
  | 'plus'
  | 'minus'
  | 'wallet'
  | 'menu'
  | 'cash'
  | 'upi'
  | 'due'
  | 'clock'
  | 'stop'
  | 'play'
  | 'chevron'
  | 'back'
  | 'check'
  | 'close'
  | 'alert'
  | 'box'
  | 'chart'
  | 'people'
  | 'receipt'
  | 'cup'
  | 'snack'
  | 'bowl'
  | 'smoke'
  | 'dot'
  | 'search'
  | 'lock'
  | 'settings'
  | 'trash'
  | 'history';

export interface IconProps {
  name: IconName;
  size?: number;
  color?: string;
  strokeWidth?: number;
}

export function Icon({ name, size = 22, color = colors.text, strokeWidth = 2 }: IconProps) {
  const common = {
    stroke: color,
    strokeWidth,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    fill: 'none' as const,
  };
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {paths(name, common, color)}
    </Svg>
  );
}

type Common = {
  stroke: string;
  strokeWidth: number;
  strokeLinecap: 'round';
  strokeLinejoin: 'round';
  fill: 'none';
};

function paths(name: IconName, c: Common, color: string) {
  switch (name) {
    case 'home':
      return <Path {...c} d="M4 10.5 12 4l8 6.5V19a1 1 0 0 1-1 1h-4v-5h-6v5H5a1 1 0 0 1-1-1z" />;
    case 'gamepad':
      return (
        <>
          <Path
            {...c}
            d="M7.5 8h9a4.5 4.5 0 0 1 4.4 5.4l-.7 3.4A2.6 2.6 0 0 1 15.9 18L14 16h-4l-1.9 2a2.6 2.6 0 0 1-4.3-1.2l-.7-3.4A4.5 4.5 0 0 1 7.5 8z"
          />
          <Path {...c} d="M8 11.5v2M7 12.5h2" />
          <Circle cx={16} cy={12.5} r={1} fill={color} stroke="none" />
        </>
      );
    case 'pool':
      return (
        <>
          <Circle {...c} cx={12} cy={12} r={8} />
          <Path {...c} d="M9.2 9.2a4 4 0 0 1 5.6 5.6" />
        </>
      );
    case 'plus':
      return <Path {...c} d="M12 5v14M5 12h14" />;
    case 'minus':
      return <Path {...c} d="M5 12h14" />;
    case 'wallet':
      return (
        <>
          <Path {...c} d="M4 8.5A2.5 2.5 0 0 1 6.5 6H17a1 1 0 0 1 1 1v1.5" />
          <Rect {...c} x={4} y={8.5} width={16} height={10} rx={2.5} />
          <Circle cx={16} cy={13.5} r={1.2} fill={color} stroke="none" />
        </>
      );
    case 'menu':
      return <Path {...c} d="M5 8h14M5 12h14M5 16h9" />;
    case 'cash':
      return (
        <>
          <Rect {...c} x={3} y={6.5} width={18} height={11} rx={2.5} />
          <Circle {...c} cx={12} cy={12} r={2.6} />
        </>
      );
    case 'upi':
      return (
        <>
          <Path {...c} d="M7 4.5 17 12 7 19.5z" />
          <Path {...c} d="M12 8.2 17.5 12 12 15.8" />
        </>
      );
    case 'due':
      return (
        <>
          <Circle {...c} cx={12} cy={12} r={8.2} />
          <Path {...c} d="M12 7.5v5l3 1.8" />
        </>
      );
    case 'clock':
      return (
        <>
          <Circle {...c} cx={12} cy={12} r={8} />
          <Path {...c} d="M12 7.6V12l3 1.8" />
        </>
      );
    case 'stop':
      return <Rect {...c} x={6.5} y={6.5} width={11} height={11} rx={3} />;
    case 'play':
      return <Path {...c} d="M8 5.6 18.5 12 8 18.4z" />;
    case 'chevron':
      return <Path {...c} d="m9.5 6 6 6-6 6" />;
    case 'back':
      return <Path {...c} d="M14.5 6l-6 6 6 6" />;
    case 'check':
      return <Path {...c} d="m5 12.8 4.5 4.4L19 7" />;
    case 'close':
      return <Path {...c} d="M6.5 6.5l11 11M17.5 6.5l-11 11" />;
    case 'alert':
      return (
        <>
          <Path {...c} d="M12 4.6 21 19.5H3z" />
          <Path {...c} d="M12 10v4" />
          <Circle cx={12} cy={16.6} r={1} fill={color} stroke="none" />
        </>
      );
    case 'box':
      return (
        <>
          <Path {...c} d="M4 8.2 12 4l8 4.2v7.6L12 20l-8-4.2z" />
          <Path {...c} d="M4 8.2 12 12.4l8-4.2M12 12.4V20" />
        </>
      );
    case 'chart':
      return <Path {...c} d="M5 19V9M12 19V5M19 19v-6M4 19h16" />;
    case 'people':
      return (
        <>
          <Circle {...c} cx={9.5} cy={9} r={3.2} />
          <Path {...c} d="M4 19.5a5.5 5.5 0 0 1 11 0" />
          <Path {...c} d="M15.5 7.2a3 3 0 0 1 0 5.6M17 19.5a5.4 5.4 0 0 0-1.6-3.8" />
        </>
      );
    case 'receipt':
      return (
        <>
          <Path {...c} d="M6 3.8h12v16.4l-2.4-1.6-2.4 1.6-2.4-1.6-2.4 1.6L6 18.6z" />
          <Path {...c} d="M9.4 9h5.2M9.4 12.6h5.2" />
        </>
      );
    case 'cup':
      return (
        <>
          <Path {...c} d="M6.5 7h11l-1.1 11.2a2 2 0 0 1-2 1.8H9.6a2 2 0 0 1-2-1.8z" />
          <Path {...c} d="M8 11.5h8" />
        </>
      );
    case 'snack':
      return (
        <>
          <Path {...c} d="M8 4.5h8l1.5 3v10.5a2 2 0 0 1-2 2h-7a2 2 0 0 1-2-2V7.5z" />
          <Path {...c} d="M6.5 7.5h11" />
        </>
      );
    case 'bowl':
      return (
        <>
          <Path {...c} d="M4 11h16a8 8 0 0 1-16 0z" />
          <Path {...c} d="M9 7.5c0-1.2 1.2-1.8 1.2-3M13.5 7.5c0-1.2 1.2-1.8 1.2-3" />
        </>
      );
    case 'smoke':
      return (
        <>
          <Rect {...c} x={3.5} y={13} width={14} height={5} rx={1.6} />
          <Path {...c} d="M13 13v5M19.5 8.5c0-1.6-1.4-2-1.4-3.4" />
        </>
      );
    case 'dot':
      return <Circle {...c} cx={12} cy={12} r={5.5} />;
    case 'search':
      return (
        <>
          <Circle {...c} cx={11} cy={11} r={6.2} />
          <Path {...c} d="m15.6 15.6 4 4" />
        </>
      );
    case 'lock':
      return (
        <>
          <Rect {...c} x={5} y={10.5} width={14} height={9.5} rx={2.6} />
          <Path {...c} d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" />
        </>
      );
    case 'settings':
      return (
        <>
          <Circle {...c} cx={12} cy={12} r={2.8} />
          <Path
            {...c}
            d="M12 3.5v2M12 18.5v2M4.9 7.8l1.7 1M17.4 15.2l1.7 1M4.9 16.2l1.7-1M17.4 8.8l1.7-1"
          />
        </>
      );
    case 'trash':
      return (
        <>
          <Path {...c} d="M5 7h14M9.5 7V5.2h5V7M7 7l.9 12.1a1.6 1.6 0 0 0 1.6 1.5h5a1.6 1.6 0 0 0 1.6-1.5L17 7" />
        </>
      );
    case 'history':
      return (
        <>
          <Path {...c} d="M4 12a8 8 0 1 0 2.4-5.7M4 5.5V10h4.5" />
          <Path {...c} d="M12 8.4V12l2.6 1.6" />
        </>
      );
    default:
      return null;
  }
}
