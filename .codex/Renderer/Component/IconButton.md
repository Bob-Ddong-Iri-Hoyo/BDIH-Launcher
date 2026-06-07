# IconButton

Source: `src/Renderer/Component/IconButton.tsx`
Story: none

역할:

- icon-only action button.
- 현재 MainView header leading back button에 사용한다.

현재 UI:

- lucide icon을 가운데 배치한다.
- `sm`, `md`, `lg` size class를 지원한다.
- `label`은 aria-label과 title로 사용한다.

주요 props:

- `icon`
- `label`
- `size`
- button HTML props.

UI 변경 지시 포인트:

- size별 hit area.
- hover/focus ring.
- disabled state.

유지할 계약:

- 접근성을 위해 label은 유지한다.
