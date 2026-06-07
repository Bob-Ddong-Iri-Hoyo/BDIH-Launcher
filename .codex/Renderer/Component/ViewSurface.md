# ViewSurface

Source: `src/Renderer/Component/ViewSurface.tsx`
Story: none

역할:

- View content에 기본 padding과 full height를 주는 얇은 wrapper.

현재 UI:

- `h-full p-6` class를 기본 적용한다.
- children을 그대로 렌더링한다.

주요 props:

- `children`
- `className`

UI 변경 지시 포인트:

- View 공통 padding.
- scroll container 여부.
- background band 여부.

유지할 계약:

- 비즈니스 로직을 넣지 않는 단순 layout wrapper로 유지한다.
