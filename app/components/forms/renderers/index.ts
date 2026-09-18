import type { JsonFormsRendererRegistryEntry } from '@jsonforms/core'
import StringControl, { tester as stringControlTester } from './StringControl.vue'
import MultilineControl, { tester as multilineControlTester } from './MultilineControl.vue'
import NumberControl, { tester as numberControlTester } from './NumberControl.vue'
import BooleanControl, { tester as booleanControlTester } from './BooleanControl.vue'
import EnumControl, { tester as enumControlTester } from './EnumControl.vue'
import DateControl, { tester as dateControlTester } from './DateControl.vue'
import TimeControl, { tester as timeControlTester } from './TimeControl.vue'
import DateTimeControl, { tester as dateTimeControlTester } from './DateTimeControl.vue'
import VerticalLayout, { tester as verticalLayoutTester } from './VerticalLayout.vue'
import HorizontalLayout, { tester as horizontalLayoutTester } from './HorizontalLayout.vue'
import GroupLayout, { tester as groupLayoutTester } from './GroupLayout.vue'
import CategorizationLayout, {
  tester as categorizationLayoutTester,
} from './CategorizationLayout.vue'
import UnsupportedElement, { tester as unsupportedElementTester } from './UnsupportedElement.vue'

export const customRenderers: JsonFormsRendererRegistryEntry[] = [
  { renderer: StringControl, tester: stringControlTester },
  { renderer: MultilineControl, tester: multilineControlTester },
  { renderer: NumberControl, tester: numberControlTester },
  { renderer: BooleanControl, tester: booleanControlTester },
  { renderer: EnumControl, tester: enumControlTester },
  { renderer: DateControl, tester: dateControlTester },
  { renderer: TimeControl, tester: timeControlTester },
  { renderer: DateTimeControl, tester: dateTimeControlTester },
  { renderer: VerticalLayout, tester: verticalLayoutTester },
  { renderer: HorizontalLayout, tester: horizontalLayoutTester },
  { renderer: GroupLayout, tester: groupLayoutTester },
  { renderer: CategorizationLayout, tester: categorizationLayoutTester },
]

export const fallbackRenderer: JsonFormsRendererRegistryEntry = {
  renderer: UnsupportedElement,
  tester: unsupportedElementTester,
}
