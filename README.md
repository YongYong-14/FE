# 세울까말까 — Android 프론트엔드

용인시 주차 위험 확인 서비스의 React Native·TypeScript·Expo Android 앱이다. 실제 카카오 로그인, 서버 API, 블루투스 연결 감지, GPS와 시스템 권한을 사용한다. 모의 로그인·기기·위치·분석 데이터 및 데모 메뉴는 제공하지 않는다.

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

`FE/`에서 실행한다. `.env.example`을 복사한 `.env`에 서버 주소와 프로젝트의 카카오 네이티브 앱 키를 설정한다.

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

최초 진입은 카카오 로그인 → 미동의 필수 약관 → 권한 안내 → 차량 1개 등록 → 홈이다. 권한 안내를 건너뛰어도 차량 등록은 필수다. 등록 기기가 실제 연결 해제되면 위치 확인(15초) → 횡단보도 응답 → 서버 분석 → 리포트·기록으로 이어진다.

## 서버와 기기 설정

```bash
cp .env.example .env
# .env에 EXPO_PUBLIC_KAKAO_NATIVE_APP_KEY 입력
# 상호·건물명·주소 검색은 EXPO_PUBLIC_KAKAO_REST_API_KEY도 입력
npm run prebuild:android
npm run android:device
```

`EXPO_PUBLIC_API_BASE_URL`은 필수다. `/api/v1`은 없을 때만 붙인다. 비워 두면 설정 오류가 표시된다. 수동 카카오 액세스 토큰을 넣는 우회 경로는 제거했다. 카카오디벨로퍼스에는 패키지명 `com.yongyong14.seulkkamalkka`와 빌드에 쓰는 서명 키 해시를 등록한다.

웹(`npm run web`)에는 Android 전용 카카오 인증·블루투스·주소 검색을 대신하는 가짜 동작이 없다. 실제 기능 검증은 Android 앱에서 한다. 웹에서 서버 요청을 테스트하려면 서버의 CORS 설정도 필요하다.

현재 화면·데이터 경계와 Figma 기준은 [온보딩과 실서비스 전환](mdfiles/12_온보딩과_실서비스_전환.md)을 따른다.

## 공통 검사 명령

```bash
npm run test:device     # 기기 서비스·저장 상태 회귀 검사
npm run test:places     # 카카오 장소 검색 회귀 검사
npm run test:parking-reports # 횡단보도 응답·리포트·기록 병합 회귀 검사
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
