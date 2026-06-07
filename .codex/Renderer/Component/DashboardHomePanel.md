# DashboardHomePanel

Source: `src/Renderer/Component/BottleDashboard.tsx`
Story: `src/Renderer/Stories/View/MainView.stories.tsx`

역할:

- Dashboard의 Bottle home 화면을 구성한다.

현재 UI:

- hero panel.
- selected wine summary panel.
- Bottle library panel.
- InstalledWinePanel toggle.
- floating create Bottle button.

주요 props:

- `wineVersions`
- `selectedWineVersion`
- `selectedWineVersionId`
- `installPath`
- `isLoadingWineVersions`
- `bottles`
- `heroImageSrc`
- `isInstalledWineOpen`
- action callbacks.

UI 변경 지시 포인트:

- hero를 줄이거나 제거할지.
- Bottle library를 더 dense하게 만들지.
- installed wine panel 위치.
- create button 위치와 모양.

유지할 계약:

- Bottle click은 detail 진입으로 이어진다.
- Bottle right click은 context menu로 이어진다.
