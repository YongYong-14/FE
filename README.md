# 세울까말까 — Android 프론트엔드

용인시 주차 위험 확인 서비스의 React Native·TypeScript·Expo 프로젝트다. 현재는 협업 초기 설정과 데모 진입·5탭 골격이 있으며, 상세 기능·Figma 화면은 구현 대기 상태다.

## 개발 환경

| 도구                        | 기준                                                      |
| --------------------------- | --------------------------------------------------------- |
| Node.js                     | 24.21.0 (`.nvmrc`)                                        |
| npm                         | 11.19.0                                                   |
| Expo / React Native / React | 58.0.23 / 0.88.1 / 19.3.0                                 |
| Java                        | JDK 21                                                    |
| Android SDK                 | Platform 37, Build-Tools 37.0.0                           |
| 검증 대상                   | Android 15(API 35) 에뮬레이터, Galaxy Z Flip3(Android 15) |

## 설치와 실행

저장소 루트에서 실행한다. 필수 환경 변수와 서버·카카오·지도 키는 없다.

```bash
nvm install
nvm use
npm install --global npm@11.19.0
npm ci
```

Windows 등 nvm을 사용하지 않는 환경은 해당 버전의 Node·npm을 직접 설치한다. Android Studio에서 SDK·에뮬레이터를 준비하고 `JAVA_HOME`·`ANDROID_HOME`·platform-tools 경로를 설정한다.

```bash
# 에뮬레이터 또는 연결된 기기에 전용 개발 빌드 설치·실행
npm run android

# 설치된 개발 빌드를 사용하는 다음 실행
npm start

# 실기기 또는 에뮬레이터를 선택해 빌드·실행
npm run android:device
```

첫 Android 빌드는 Gradle·SDK 의존성을 내려받아 시간이 걸릴 수 있다. `npm start`만으로는 최초 개발 빌드가 설치되지 않는다. 네이티브 의존성·앱 설정 변경 후에는 개발 빌드를 다시 만든다.

개발 빌드는 에뮬레이터·실기기마다 각각 설치해야 한다. `No development build`가 나오면 해당 기기를 선택해 `npm run android:device`를 실행한다. API 37 에뮬레이터도 개발용으로 사용할 수 있다. API 35를 기본 검증 환경으로 둔 이유는 Flip3의 Android 15와 맞추기 위해서이며, 두 환경을 함께 확인한다.

현재 기본 흐름은 데모 로그인 → 안내 → 차량 1개 등록 → 5탭이다. 로그아웃 후 차량·설정은 보관하며 재로그인 시 복원한다. 실제 인증·기기 권한·지도·분석 API는 연결하지 않는다.

## 공통 검사 명령

```bash
npm run check           # 타입·린트·포맷 검사
npm run format          # 포맷 적용
npm run lint:fix        # 자동 수정 가능한 린트 반영
npm run doctor         # Expo 진단
npm run export:android # Android JS 번들 생성(APK 빌드와 별개)
```

## 브랜치와 PR

| 브랜치    | 역할                  |
| --------- | --------------------- |
| `main`    | 검증된 통합 결과      |
| `dev`     | 두 개발자의 작업 통합 |
| `onjunku` | 온준규 개인 작업      |
| `ummpa`   | 김서은 개인 작업      |

`onjunku / ummpa → dev → main` 순서로 PR을 연다. 개인 브랜치는 유지하며 다른 사람의 개인 브랜치에 작업을 올리지 않는다. 공통 파일 변경과 최신 `dev` 반영 절차는 [협업 가이드](mdfiles/08_협업과_초기세팅.md)를 따른다.

## 문서

- [기획 문서 목록](mdfiles/README.md)
- [공통 정책](mdfiles/00_공통정책.md)
- [폴더 구조](mdfiles/07_폴더구조.md)
- [협업·초기 설정·검증 상태](mdfiles/08_협업과_초기세팅.md)
- [팀원1·팀원2 역할 분담](mdfiles/09_프론트_역할분담.md)

`android/`·`ios/`는 Expo 설정으로 생성하는 로컬 결과물이며 Git에서 제외한다. 기기별 경로·생성물을 커밋하지 않고 공통 변경은 앱 설정·config plugin으로 관리한다.
