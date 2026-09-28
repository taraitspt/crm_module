FROM eclipse-temurin:17-jre-alpine
RUN apk add --no-cache \
    libreoffice \
    fontconfig \
    font-noto-cjk
WORKDIR /app
COPY build/libs/*.jar app.jar
EXPOSE 8080
ENTRYPOINT ["java", "-Dspring.profiles.active=dev", "-jar", "app.jar"]
