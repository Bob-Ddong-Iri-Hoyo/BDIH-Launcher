# ImageButton

Source: `src/Renderer/Component/ImageButton.tsx`
Story: `src/Renderer/Stories/Component/ImageButton.stories.tsx`

역할:

- 이미지가 있는 app/game tile button.

현재 UI:

- image thumbnail.
- name, subtitle, optional action label.
- active state는 accent selection으로 표시한다.

주요 props:

- `src`
- `name`
- `subtitle`
- `actionLabel`
- `isActive`
- `onClick`

UI 변경 지시 포인트:

- thumbnail aspect ratio.
- action button 표시 방식.
- active state 강조.
- subtitle line clamp.

유지할 계약:

- 전체 tile은 button으로 동작한다.
