# StatusBadge

Source: `src/Renderer/Component/StatusBadge.tsx`
Story: `src/Renderer/Stories/Component/StatusBadge.stories.tsx`

역할:

- 상태 label과 tone을 작게 표시하는 badge.

현재 UI:

- `neutral`, `info`, `success`, `warning`, `danger` tone 지원.
- install status를 tone/label로 바꾸는 helper가 함께 있다.

주요 props:

- `label`
- `tone`
- `className`

UI 변경 지시 포인트:

- badge 크기.
- border/background/foreground 색.
- uppercase 여부.

유지할 계약:

- destructive/error 상태는 danger tone으로 구분한다.
