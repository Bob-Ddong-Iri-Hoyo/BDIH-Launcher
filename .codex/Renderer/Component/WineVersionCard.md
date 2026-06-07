# WineVersionCard

Source: `src/Renderer/Component/WineVersionCard.tsx`
Story: `src/Renderer/Stories/Component/WineVersionCard.stories.tsx`

역할:

- Wine version 하나를 표시하고 선택/설치 action을 제공하는 card.

현재 UI:

- Wine name, type/version metadata.
- status badge.
- progress bar.
- install/select action button.
- selected state는 accent selection으로 표시한다.

주요 props:

- `version`
- `installPath`
- `isSelected`
- `onSelect`
- `onInstall`

UI 변경 지시 포인트:

- progress 표시 위치.
- install button density.
- selected state 강조.
- path/metadata 표시 여부.

유지할 계약:

- install action과 select action의 의미를 혼동하지 않는다.
