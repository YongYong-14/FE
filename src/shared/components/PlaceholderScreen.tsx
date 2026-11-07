import { AppText } from './AppText';
import { Screen } from './Screen';
import { colors } from '@/shared/theme/tokens';

export function PlaceholderScreen({ title, description }: { title: string; description: string }) {
  return (
    <Screen>
      <AppText variant="title" weight="black">
        {title}
      </AppText>
      <AppText style={{ color: colors.muted }}>{description}</AppText>
    </Screen>
  );
}
